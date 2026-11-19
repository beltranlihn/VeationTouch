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

- **Arriba:** sala activa (cambiarla pide confirmación: detiene sus sensores y salidas), estado de sensores y
  toques, modo de proyección (Off / Pattern / Debug),
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
   El teléfono o la tablet abre el **mando de calibración** (§ 8), no la aplicación entera: el ordenador es la
   aplicación completa. **Full app** (abajo a la derecha del mando) abre la aplicación completa en ese dispositivo y
   **System › This device › Calibration remote** vuelve al mando; la elección se recuerda en el dispositivo.
4. El enlace lleva la clave de acceso de la instalación: compartirlo solo con operadores.
5. También se puede escribir por nombre: `http://veation-touch.local:8770/?k=…` (el panel lo muestra entero).
   Funciona en iPad, iPhone, Mac y Windows; en Android depende de la versión. El nombre se cambia en
   **System › Network** (dos salas en la misma red necesitan nombres distintos). En el propio ordenador de la sala
   usar `localhost`.
6. Si un dispositivo abre la página sin la clave (por ejemplo, un acceso directo antiguo) ve **This device is not
   paired**: volver a escanear el QR de **Connect device** en el ordenador de la sala.
7. **Punto de acceso propio:** si la Wi-Fi de la sala da problemas, activar en Windows *Configuración › Red ›
   Zona con cobertura inalámbrica móvil* (Mobile hotspot). El panel la detecta, la pone la primera
   («This PC's hotspot») y recuerda unirse primero a esa Wi-Fi.

El panel nombra la **Wi-Fi a la que tiene que unirse el teléfono** (por ejemplo «It must be on the Wi-Fi
“BCN_XRLab_Guest”») y distingue tres casos:
- **Connected: iPhone (…)**: conectado.
- **… reached this computer but is not connected**: el teléfono llegó al ordenador pero sin la clave → volver a
  escanear el QR.
- **Nothing has reached this computer from another device yet** (a los 20 s): el teléfono está en otra red, en datos
  móviles, o en una Wi-Fi que aísla los dispositivos.

**Wi-Fi de invitados:** si la red se llama como una red de invitados (*guest*, *invitados*…), el panel avisa: esas
redes suelen impedir que los dispositivos se vean entre sí. Lo más fiable es el **punto de acceso del propio
ordenador** (**Open Mobile hotspot settings** abre la página de Windows: activarlo, unir el teléfono a esa Wi-Fi y
escanear de nuevo) o la red propia de la sala.

Si no abre:
- Comprobar que la tablet está en la misma red.
- Si aparece «No VEATION Touch firewall rule found», pulsar **Fix (administrator)** en el ordenador de la sala.
- Algunas Wi-Fi aíslan los dispositivos entre sí: usar el punto de acceso de la sala con el aislamiento desactivado,
  o conectarse **por internet** (abajo).

### Por internet (desde cualquier red)

Sirve cuando el teléfono no llega al ordenador por la Wi-Fi (XR Lab: la Wi-Fi de invitados no llega al servidor), o
para calibrar con datos móviles. El ordenador de la sala sólo necesita internet: no hay que tocar el router ni el
cortafuegos, porque es él quien se conecta hacia fuera, al relé de Alma Digital Studio (Cloudflare).

1. En el **propio ordenador de la sala**: **Connect device › Over the internet › Turn on internet access**. El
   estado pasa a **Online** en unos segundos. Se puede apagar en **System › Network › Internet access**.
2. Escanear el QR que aparece. Abre **veation-touch.vercel.app**, que recuerda la sala en ese teléfono y lo lleva al
   mando de calibración a través del relé. La próxima vez basta con abrir veation-touch.vercel.app y pulsar
   **Open**.
3. El enlace lleva la clave de acceso: compartirlo sólo con operadores. **New address** (System › Network) cambia
   la dirección y deja sin acceso a todos los enlaces ya repartidos.
4. Si la página dice que la sala está *offline*, el ordenador de la sala está apagado, sin internet o con el acceso
   por internet desactivado.
5. Por internet funciona todo el mando. Lo que cambia la red o el sistema del ordenador (tarjeta de los sensores,
   cortafuegos, encender o apagar este acceso) sólo se hace desde el propio ordenador.

## 5. Crear una sala

**Room › New room…** (o **System › Room profiles › + New**, que abre el mismo asistente). En modo tira el ancho del
lienzo se calcula solo a partir de los muros (mismos píxeles por metro en todos) y el asistente lo muestra antes de
crear. Al crear la sala se pasa directamente a **Sensors**, el paso siguiente:
- Número de muros, ancho y alto de cada uno (alto = alto de la imagen proyectada).
- Lienzo: **Continuous strip** (un panorama continuo; ej. Barcelona XR Lab = 7196 × 912 px) o **Grid**
  (ej. 2×2 para un procesador de 4 salidas).
- Sensores: un S2E por muro con IPs consecutivas, simulados, o ninguno.

Después, en **Room**, ajustar nombres y medidas exactas (o arrastrar los bordes). Cada sala es un **perfil**:
se puede duplicar, exportar e importar desde **System**. Cada cambio guarda la versión anterior
(**System › Versions**, últimas 30).

## 6. Poner en marcha los sensores

**Alimentación.** El S2E **no se alimenta por PoE**: su cable trae un conector Ethernet (sólo datos) y una entrada de
corriente aparte (conector DC 5,5 × 2,1 mm) de **12 V** (lo que indican la tarjeta del kit y el sensor; usar siempre
12 V aunque el datasheet cite un margen más amplio). Consume ≈ 2,4 W funcionando, pero al
arrancar pide hasta **1,5 A a 12 V (18 W)**. Enchufado a un switch PoE estándar (802.3af/at) recibe datos, no
corriente (el switch no le da tensión porque no la pide). Dos maneras:
- **Un cable por sensor desde el switch PoE:** en cada sensor, un **splitter PoE activo 802.3at (PoE+)** con salida
  **12 V ≥ 2 A** (conector 5,5 × 2,1 mm) y paso de datos 10/100. Un splitter 802.3af (12,95 W) se queda corto en el
  arranque. El switch debe dar PoE+ en esos puertos (≈ 25 W cada uno).
- **Un adaptador de 12 V ≥ 2 A por sensor** (fuente estabilizada, poco rizado: el ruido de la fuente aumenta el ruido
  del láser) y el Ethernet a cualquier switch.
Nunca un inyector PoE **pasivo** (pone tensión fija en el cable sin negociar). Comprobar la polaridad del conector DC
(centro positivo es lo habitual) antes de enchufar.

Todo se hace desde la app, sin otro programa: **Sensors › Sensor network…**

1. **This computer.** Cada S2E nuevo viene con la IP **192.168.11.2**, así que el ordenador necesita una dirección en
   esa red. Si la tarjeta de red conectada al switch de los sensores no tiene dirección (red sin DHCP), la app la
   reconoce y ofrece **Use it for the sensors (192.168.11.5)**: Windows pide permiso de administrador y sólo cambia
   esa tarjeta (la Wi-Fi y las demás redes siguen igual).
2. **Sensors.** Conectar los sensores nuevos **de uno en uno** (todos traen la misma IP): enchufar uno, **Search
   again**, elegir su muro y **Put on P1**. La app le da su dirección (en orden: .11, .12…; o la que el muro ya
   esperaba), espera a que el sensor reinicie y **sólo da el cambio por bueno cuando el sensor responde en la nueva
   dirección con el mismo número de serie**. **El reinicio tarda: entre 10 s y algo más de un minuto según la
   unidad** (medido en XR Lab). La fila cuenta los segundos; no hay que desenchufar nada. Si pasado 1,5 min aún no
   responde, la app lo deja asignado («not answering yet») y el sensor se conecta solo en cuanto responde. Sólo si
   tampoco aparece en los 2 minutos siguientes, apagarlo y encenderlo y pulsar **Search again**. Si el sensor vuelve
   a responder en su dirección anterior, la app dice que no aceptó el cambio. El sensor queda añadido a su muro.
   Después, el siguiente. **Other address…** permite elegir otra; **Change address…** cambia la de un sensor ya
   asignado.
   - Un sensor recién enchufado tarda hasta un minuto en contestar: si **Search** no lo encuentra, esperar y
     buscar de nuevo. Un S2E nuevo **no gira ni se enciende** hasta que la app lo pone a escanear: es normal.
   - La búsqueda mira sólo la red de los sensores (la de 192.168.11.2 y la de los sensores del perfil).
     **Search every network** busca en todas las redes del ordenador (para sensores con direcciones raras).
3. ¿Cuál es cuál? El que se acaba de enchufar. Con todos funcionando, agitar la mano delante de un sensor: su fila
   en la lista de Sensors muestra **moving**.
4. Con la **sala vacía**: **Capture background — all sensors** (arriba en **Sensors**, también en la lista previa de
   **Calibrate** y en **Live › Health**) captura el fondo de todos a la vez. Después, para cada sensor (su panel sigue
   el orden de uso: estado → fondo → montaje → calibración; red y detalles van plegados):
   - **Capture background**: aprende lo que ve sin nadie (suelo, muros vecinos, objetos fijos). Empieza tras una
     cuenta atrás de 5 s para que quien sostiene la tablet se aparte. Si algo se movió durante la captura, lo
     indica (con la posición) y pide repetirla: lo que quede en el fondo tapa los toques en ese punto.
   - **Auto-align (room empty)**: calcula la posición y el giro del sensor a partir del suelo y los muros
     vecinos, y mide el ancho real del muro. Si el ancho difiere del plano más de 3 cm, lo avisa.
   - **Izquierda o derecha (Check side)**: la sala vacía se ve igual en espejo, así que Auto-align no puede saber
     qué lado es la izquierda. Antes de aplicar, poner **una mano plana en el muro cerca de su extremo IZQUIERDO**
     (mirando el muro desde dentro de la sala) y pulsar **Check side**. Si la mano sale a la derecha, pulsar **Flip
     left/right and align again**. En XR Lab los cuatro sensores estaban espejados.
   - Si Auto-align confunde un objeto con la esquina (una pata de truss, un mueble), lo avisa («not the corner») y
     calcula la posición desde el otro lado.
   - Revisar y pulsar **Apply**.
5. En el lienzo de **Sensors** los puntos blancos son lo que ve el láser; los grises, el fondo. La línea del
   suelo debe quedar sobre el borde inferior del muro.

**Nivelación del soporte:** el plano del S2E puede venir inclinado hasta 1,5° de fábrica (≈ 2,6 cm por metro).
El soporte debe permitir ajustar la inclinación en dos ejes.
- **Level check** (Sensors › Mounting), con la sala vacía: indica si el plano del láser **roza la pared** (dónde y a
  qué distancia del sensor, marcado en rojo en el lienzo) y si la **línea del suelo** se ve completa de esquina a
  esquina. Usa los datos en vivo (último medio segundo), así que se puede repetir justo después de cada ajuste del
  soporte: inclinar el sensor para separar el plano de la pared por ese lado hasta que salga en verde. Al terminar,
  volver a capturar el fondo (si el fondo guardado ya no coincide con lo que ve el sensor, el chequeo lo avisa).
- **Un muro con el plano más separado** (algo sobresale de la pared y el sensor tiene que ir por delante, como la barra
  de luz de P3 en el XR Lab): poner esa distancia en **Room › Scan plane** (ej. 0,12 m). Ese muro reacciona unos
  centímetros **antes** de tocar, y la lectura se desplaza según el ángulo del brazo; por eso **Verify** le admite
  más error: 25 mm más la mitad de lo que el plano pasa de 3 cm (a 12 cm, 70 mm).
- Lo que no puede ver: un plano demasiado **lejos** de la pared. Comprobar con una regla apoyada perpendicular a la
  pared en varios puntos que se detecta a 1,5–3 cm de la pared en todo el muro.

## 7. Mapping: el muro en los píxeles del contenido

**Mapping** muestra el lienzo de salida (ej. 7196 × 912) con la región de cada muro.
- **Rect:** región rectangular. Arrastrar para mover; esquinas para redimensionar; flechas 1 px (Shift 10 px).
- **Corners:** arrastrar las 4 esquinas de forma libre (corrige keystone).
- **Grid:** malla de nodos; arrastrar nodos, **+ Row / + Column** donde se hace clic, **Subdivide**. Cruceta
  de 1/5/20 px para ajustar desde la tablet.
- **Pattern** proyecta la retícula de cada muro con marcadores ámbar en las esquinas: ajustar
  hasta que coincidan con las esquinas físicas.
- **Content underlay:** subir un fotograma del contenido (PNG/JPEG) para verlo bajo el lienzo y bajo los muros
  en Zones. Botón **Content** para mostrarlo u ocultarlo.

El mapeo cambia dónde caen los toques en coordenadas de lienzo; nunca modifica la imagen.

## 8. Calibrar un muro (desde la tablet, dentro de la sala)

**El mando del teléfono.** Arriba: sala, sensores y toques (**Simulated** si son simulados). Debajo:
- **La sala en vivo:** los muros uno al lado del otro, sus zonas (ámbar, rellenas mientras están activas) y las manos
  (cian). Tocar un muro lo elige.
- **Next — el asistente:** UNA cosa que hacer, en orden, con su botón, hasta dejar la sala lista: sensores
  funcionando → fondo con la sala vacía → proyección abierta → calibrar cada muro → verificar cada muro (si uno
  falla, **Fix** lleva al punto peor) → prueba de paseo → bloquear (**Show**). En Show mode avisa de que hay que
  desbloquear en el ordenador.
- Los muros (con «calibrated» en los ya calibrados) y cinco pasos para el muro elegido:

| Paso | Qué se hace |
|---|---|
| **Prepare** | Lista previa: sensores del muro funcionando, fondo capturado (**Capture Px** / **All walls**), proyección abierta. |
| **Calibrate** | Dianas proyectadas: tocar y mantener cada una (puntos 1–5 de abajo). Si un toque no encaja con los demás, la app pide repetir esa diana sola. |
| **Fit** | Ajuste fino con la mano: ver más abajo. |
| **Verify** | Puntos nuevos; mide el error real del toque. Si el peor pasa de 25 mm: **Fix point N with your hand** abre Fit en ese punto. |
| **Test** | Prueba de paseo de toda la sala: ver más abajo. |

Abajo: lo que muestra la proyección (**Off / Pattern / Debug**) y **Full app**. Mientras una calibración o una
verificación está en marcha, el mando se queda en su muro y en su paso.

**Cada pantalla del mando es una sola acción:**
- **Cabecera:** «Step N of 5 · …».
- **Qué hacer**, empezando por el verbo: el muro por nombre y posición, dónde y cómo tocar. Por ejemplo: «Press
  the amber ring at the top left (1.9 m up) on the 3rd wall from the left — P2, open palm, hold until the ring is
  full».
- **«You should see:»** cómo se ve cuando sale bien.
- **«If not:»** qué hacer cuando no sale.
- **Un solo botón principal.**
- El progreso de los muros siempre a la vista («Walls 2 of 4 done»).
- Mientras corre una calibración o una verificación, el mando oculta todo lo demás.
- **Al aceptar un toque:** vibra, el objetivo destella en cian (en rojo si hay que repetirlo) y suena un pitido.
  **Sound on/off** está en el pie y el teléfono lo recuerda.

Detalles por paso:
- **Prepare** ofrece sólo lo que falta: reiniciar sensores, capturar el fondo, abrir la proyección o «Next:
  calibrate Px».
- **Calibrate:** con el muro ya calibrado, el botón principal pasa a «Next: verify Px».
- **Verify:** superado, lleva a lo siguiente (otro muro o la prueba de paseo); fallido, a **Fix it with your hand**.
- El muro se nombra por su orden en la tira, porque el perfil no guarda su orientación física.

**Cuadrícula en los muros (pixel map).**
- **Encenderla:** **Calibrate › Pixel map › Grid on the walls** en el ordenador, o **Show a grid on the walls** en
  Verify y Test del teléfono.
- **Qué proyecta:** sobre cada muro, una retícula en metros (líneas cada 0,5 m y 1 m, con números), el contorno,
  el centro, las esquinas y el nombre del muro.
- **Cómo llega a los muros:** va dentro de la **salida Texture** (Spout / NDI / ventana), así que llega aunque los
  proyectores los alimente el sistema de medios de la sala (como en XR Lab), y también a la ventana de proyección.
- **Comprobar antes de calibrar:** que el contorno coincide con el muro real y que las líneas de 1 m coinciden con
  una cinta métrica. Después, con la mano sobre una línea, el disco del toque debe caer encima.
- **Durante una sesión:** mientras se calibra, se verifica o se usa Fit, los objetivos se dibujan sobre la misma
  cuadrícula.
- **Desactivarla en una salida:** en **Outputs › Texture**, **Calibration overlay: Off** deja esa salida sólo con
  los toques.

**Fit — ajustar con la mano.** Después de calibrar, si en algún sitio el toque cae algo desplazado respecto al
contenido (pared no del todo plana, proyector que dobla la imagen), se corrige punto a punto:
1. **Fit** del muro. Si el muro usa un rectángulo o un *corner pin*, **Make a N × M mesh** lo convierte en una malla
   (un punto cada ~1,5 m de ancho y ~1,2 m de alto) con exactamente la misma imagen: nada se mueve todavía.
2. La proyección dibuja la malla de ese muro con sus puntos ámbar, el punto elegido con un círculo blanco y la mano
   como un **anillo cian** (dónde la ve el sistema), sea cual sea el modo de proyección. Las manos simuladas se
   apartan de ese muro.
3. Poner una mano abierta sobre un punto ámbar. Con **Follow my hand** (activo por defecto) se elige el punto bajo la
   mano; también se puede tocar en el mapa del teléfono.
4. **Match the point to my hand**: el punto se corrige para que la posición de la mano caiga justo en ese píxel del
   contenido; el anillo queda bajo la mano (el punto ámbar se desplaza: es normal). Para retocar, las flechas
   mueven el punto 1, 5 o 20 px (tocar el centro de la cruceta para cambiar el paso). **Undo** deshace el último paso.
5. Repetir en cada punto que esté desviado. Si la mano está lejos del punto, o la corrección pasaría de 60 cm, el
   mando lo dice y no mueve nada (señal de que hay que recalibrar el muro).

El ajuste cambia dónde caen los toques en coordenadas del contenido; nunca modifica la imagen.

**Ensayar en simulación.** Con sensores simulados nadie puede tocar la proyección: el mando muestra botones
discontinuos **Simulated hand on target N** (Calibrate), **… on check point N** (Verify), **Simulated hand near the
chosen point** (Fit: cae 4 cm a la derecha y 3 cm abajo, para que Match tenga algo que corregir) y **Simulated hand
across every corner** (Test). Las manos simuladas que pasean se apartan del muro mientras se captura su fondo.

**Test — prueba de paseo.** Mientras está abierto, la proyección muestra en todos los muros **lo que envían las
salidas**: un disco blanco bajo cada mano (el mismo dibujo que la salida Texture) y las zonas. Recorrer la sala tocando
cada muro (arriba, abajo, cerca de los bordes) y pasando la mano por cada esquina; el mando marca **Touched P1…** y
**Crossed the corner P4 → P1…**. Donde el disco no quede bajo la mano: dejar la mano ahí, sola en el muro, y **Fix
here** abre Fit en ese muro con el punto bajo la mano. **The room passes the walk test** se activa cuando están todos
los muros y todas las esquinas. Una verificación nueva vuelve a pedir la prueba.

**Paso a paso de la calibración:**

1. **Calibrate**, elegir el muro. La lista previa debe estar en verde: sensores funcionando, fondo capturado
   (**Capture Px** o **All walls**), proyección abierta. La marca de proyección sólo se pone verde cuando hay una
   página de proyección conectada de verdad (elegir la pantalla y **Open** ahí mismo). Si no se puede empezar, debajo
   del botón se dice por qué (sensor parado, sin fondo…). Las manos simuladas se apartan del muro que se calibra.
2. Objetivos: 3 × 3 por defecto, entre 0,45 m y 1,9 m de altura (al alcance de la mano).
3. **Start calibration**. En el muro aparece un objetivo ámbar: tocarlo con la mano abierta y mantener
   0,7 s hasta que el anillo se complete; retirar la mano. Pasa solo al siguiente.
   Si un toque no encaja con los demás (otra diana, la mano fuera del punto, alguien que pasa por delante: más de 4 cm
   respecto a lo que dicen las demás), la app lo detecta sola y pide repetir esa diana («Target N did not match the
   others…») antes de dar el resultado; cada diana se repite como mucho una vez.
4. Resultado: error medio (RMS) y peor punto por sensor. Por debajo de ~10 mm es excelente.
   - **Redo worst point** repite el objetivo con más error.
   - **Apply & save** guarda la calibración.
   - **Cancel calibration…** (abajo, separado de *Back* y *Skip target*) pide confirmación antes de descartar las
     dianas capturadas.
5. **Verify**: 5 puntos nuevos; mide el error real del toque tal como lo reciben las aplicaciones.
   Peor punto por debajo de 25 mm = bien para manos.

En el mando la calibración ocupa la pantalla con el anillo de progreso y el mapa de dianas; en la app completa de
una tablet, igual (modo foco) con botones grandes.

**Un solo dispositivo manda.** Quien inicia la calibración (o la verificación) la controla. Los demás
dispositivos la ven en modo lectura con el aviso «Calibration in progress on …» y no pueden editar la sala
mientras dura. Si la tablet se queda sin batería, **Take control** en otro dispositivo (pide confirmación) y se
sigue desde ahí; si el dispositivo que mandaba se desconecta, el siguiente que actúe toma el control.

## 8 bis. Esquinas continuas y vista 3D

**Esquinas continuas.** Lo importante de unir los muros en un solo lienzo: al pasar la mano de un muro al
siguiente por la esquina, sigue siendo **el mismo toque** (mismo id, sin «up» ni «down»). Las aplicaciones lo
reciben como un movimiento continuo y un aviso `/vt/cross`. Viene activado cuando los muros cierran una sala (como
XR Lab); si no, se activa por muro en **Room › Corner with the next wall › Continuous**. En
**System › Processing › Corner zone** se ajusta la franja (25 cm a cada lado de la esquina).

**Vista 3D.** **Live › 3D** muestra la sala de pie: muros con el contenido, zonas (se iluminan al activarse),
máscaras, manos en tiempo real, sensores y puntos del LiDAR. Arrastrar = girar; botón derecho o Mayús = desplazar;
rueda o pellizco = zoom; doble clic = encuadrar. **Inside** pone la cámara en el centro de la sala a la altura de
los ojos. Con **Virtual hand** se toca la pared en 3D (también cruzando esquinas). La forma de la sala sale del orden
de los muros y del ángulo de cada esquina (**Room › Corner with the next wall › Angle**, 90° por defecto).

## 9. Zonas y máscaras

**Zones** tiene dos espacios (arriba a la izquierda):
- **Wall:** un muro en metros (cambiar con P1, P2…).
- **Canvas:** el lienzo de salida en píxeles, con el contenido de fondo. Una zona de lienzo puede cruzar muros
  (una puerta pintada sobre una esquina): los toques le llegan a través del Mapping de cada muro. En los muros
  se ve discontinua.

Dibujar:
- **Zone** y la forma: **Rect** (arrastrar), **Circle** (arrastrar desde el centro) o **Polygon** (un clic
  por punto; cerrar pulsando el primer punto, con doble clic, con **Enter** o con **Finish**; **Backspace**
  quita el último punto; **Esc** cancela).
- Editar: arrastrar la zona para moverla; tiradores para redimensionar. En un polígono, arrastrar un punto lo
  mueve, arrastrar el punto medio de un lado añade uno, y doble clic en un punto (o seleccionarlo y **Supr**)
  lo borra. **Ctrl+D** duplica, **Supr** borra la zona, flechas para mover fino, ajuste a 1/5/10 cm (o px).
- Cada zona envía entrar / mantener / salir y su número de manos. **Hold after** = tiempo para «mantener»;
  **Release after** = tiempo sin manos para «salir»; **Min hands** = cuántas manos a la vez hacen falta para
  activarla (2 = «dos personas juntas»); **Trigger address** = dirección para la salida Triggers.
- **Fire (test)** activa la zona un momento (entrar … salir) por todas las salidas, sin tocar la pared: sirve
  para comprobar el receptor (TouchDesigner, la mesa de luces…).
- **Mask:** zonas ignoradas (puerta, lámpara, altavoz), rectángulo o polígono. Lo que caiga dentro nunca es un
  toque. Las máscaras se dibujan en el muro (actúan sobre los datos del LiDAR).

## 10. Salidas

**Outputs › + Add…** para añadir un destino:

| Tipo | Para qué | Puerto por defecto |
|---|---|---|
| **OSC** | Toques completos (id, posición, velocidad, tamaño, edad, down/up) — TouchDesigner, Unreal | 9000 |
| **Triggers** | Solo zonas: `/dirección 1` al entrar, `0` al salir — Resolume, MadMapper, QLab, mesas de luces | 7000 |
| **TUIO** | Estándar multitáctil | 3333 |
| **Texture** | Máscara blanco y negro de los toques, por **Spout** (mismo ordenador), **NDI** (la red) o **pantalla completa** en una pantalla | — |
| **Webhook** | Eventos de zona (entrar / mantener / salir) como petición HTTP con JSON — control de show, domótica, servidores propios | URL |
| **Art-Net** | Un canal DMX por zona (255 mientras está activa) — mesas de luces y nodos DMX | 6454 |
| **sACN** | Los mismos canales DMX por el estándar ANSI E1.31 (multicast por defecto) — consolas, servidores de medios, pasarelas | 5568 |
| WebSocket | Apps web/Electron: `ws://<servidor>:8770/ws/data` y SDK en `/sdk/veation-touch.js` | — |

**Texture — destino.** **Send to** elige por dónde sale, y sólo ese destino funciona (los otros ni se arrancan;
con **Enabled** apagado no sale nada y la ventana se cierra):
- **Spout:** a programas de este mismo ordenador (TouchDesigner *Syphon Spout In TOP*, Resolume, MadMapper). Sólo una
  salida a la vez puede usar Spout.
- **NDI:** a cualquier ordenador de la red; aparece como «ORDENADOR (nombre)» (TouchDesigner *NDI In TOP*, Resolume,
  OBS). Necesita el **NDI Runtime** instalado en el ordenador de la sala (gratuito, ndi.video; viene con NDI Tools).
  El panel dice cuántos receptores la están viendo.
- **Full screen:** una ventana a pantalla completa en la pantalla elegida (**Display**), para una capturadora o la
  entrada de vídeo de otra máquina. **Fit** mantiene las proporciones del lienzo con negro alrededor; **Stretch**
  llena la pantalla. Sin la app de escritorio (en un navegador), **Open page** y F11.

**Texture — ver la salida en vivo.** Al elegir la salida *Texture* el lienzo central muestra la máscara en blanco y
negro tal como sale (el mismo código que la genera), con los muros de referencia. En **Blobs**:
- **Size:** *Fixed* (todos los discos del mismo radio) o *Follows the touch* (el disco toma el ancho medido de lo que
  toca —una mano, un brazo, un cuerpo— y el radio pasa a ser el mínimo).
- **Radius**, **Soft edge** (borde difuminado) y **Trail** (estela, en ms): faders como los de VEATION (surco fino con
  relleno; se pulsa y arrastra en cualquier punto, o flechas del teclado). El cambio se ve al instante en el lienzo y
  se guarda al soltar (un solo paso de deshacer). Tocar el recuadro del valor permite escribirlo.
- **Rate** y **Walls** (qué muros entran en la textura).
Con la sala simulada, **Virtual hand** en la barra del lienzo permite probarla sin sensores.

**Coordinates:** *Per wall* (0–1 de cada muro) o *Canvas* (0–1 del lienzo completo, sigue el Mapping).
**Send test** envía un mensaje de prueba. La lista completa de direcciones está en `docs/OSC.md`.

En TouchDesigner: *OSC In DAT* en el puerto (una fila por mensaje); para la textura, *Syphon Spout In TOP*
con el emisor «VEATION Touch».

## 11. Durante la función

- **Show** (arriba) bloquea la sala: nadie puede mover zonas, sensores ni el mapeo por accidente. Las salidas,
  la proyección y las pruebas siguen funcionando. Para desbloquear hay que confirmar.
- **Live › Health** muestra lo que necesita atención, agrupado y con el botón que lo resuelve: sensores sin datos
  (con el motivo en palabras: «no answer from … — check its cable, power and IP address»), sensores sin fondo
  (**Capture all**), muros sin calibrar (**Calibrate Px**), salidas con error, motor lento. «✓ All sensors
  scanning…» = todo bien.
- En **Show** siguen funcionando la vista (**View**, **2D / 3D**, **Inside**) y **Virtual hand**.
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
| Sensor *offline* | Cable, alimentación de 12 V (el S2E no toma corriente del PoE: splitter PoE+ o adaptador, §6), IP correcta en Sensors, **Restart**; **Sensor network…** para ver si responde |
| El teléfono no abre el enlace en una Wi-Fi de invitados | Punto de acceso del ordenador (§4, **Open Mobile hotspot settings**) |
| Un teléfono muestra «This page could not start» | El error ya está en el registro del ordenador (**System › Log**, «page error on iPhone…»): enviarlo al equipo de desarrollo; **Reload** lo reintenta |
| Toques fantasma en un muro vacío | Recapturar el fondo con la sala vacía; máscara sobre el objeto; subir *Background margin* |
| Toques desplazados | Verify; recalibrar ese muro; revisar Mapping con *Pattern* |
| Toques que se cortan | Nivelar el soporte (plano demasiado lejos de la pared); *Keep through gaps* en System › Processing |
| La tablet no abre el enlace | §4: misma red, regla del cortafuegos, aislamiento de la Wi-Fi |
| TouchDesigner no recibe | Puerto y host en Outputs, **Send test**, cortafuegos del equipo receptor |
