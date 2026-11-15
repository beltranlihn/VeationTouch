# VEATION Touch — Propuesta de UX/UI

**Versión analizada:** 0.1.0 · **Fecha:** 2026-11-14 · **Alcance:** análisis y diseño (no se ha tocado código ni perfiles).

**Qué se revisó.** Todo el código de la interfaz (`ui/`), el motor en lo que afecta a la interacción (`engine/engine.js`,
`profile.js`, `core/calibration.js`, `server.js`), el contrato de salida (`docs/OSC.md`), la investigación previa
(`docs/research/`), los tokens y la estructura de VEATION, y los addons nativos de Spout y NDI de VEATION. La app se
recorrió en marcha con el perfil *Barcelona XR Lab (simulated)* a 1440×900, 768×1024 y 375×812, incluida una sesión de
calibración iniciada y cancelada (el fondo capturado para la prueba se borró después). No hay hardware real: todo lo
que depende del S2E va marcado como **[validar con hardware]**.

**Convenciones.** Los textos de interfaz aparecen en inglés entre comillas o en `código` (regla de la casa). Severidad
de los problemas: **4** bloquea la tarea · **3** grave (la tarea se hace mal o con mucho esfuerzo) · **2** molesto ·
**1** cosmético.

**Referencia pendiente de incorporar — `[REF lidar-ui]`.** El propietario señala el «LIDAR Visualization System» /
lidar-ui de Tolch (https://tolchx.com/lidar-ui/) como *la* referencia de cómo debe ser un sistema de montaje, tracking
y calibración multitáctil. Ese producto se está analizando aparte y su resultado irá en `docs/ux/ANALISIS-LIDAR-UI.md`.
Esta propuesta **no** lo duplica: lo que aquí se dice de lidar-ui procede sólo de la investigación previa del
repositorio (página pública del producto). Los puntos donde ese análisis debe contrastar o corregir esta propuesta
están marcados en el texto con **`[REF lidar-ui]`** y reunidos en el Anexo D. Hasta entonces, las decisiones marcadas
son provisionales.

---

## 1. Resumen ejecutivo

### Qué falla hoy

La interfaz actual es un **visor con formularios**: un único lienzo fijo (los muros desenrollados en tira) y un panel
lateral que cambia según la herramienta. El comentario del director creativo es exacto: al cambiar de herramienta sólo
cambia el panel. Las consecuencias concretas:

1. **El lienzo no es un espacio de trabajo.** En las siete herramientas se ve lo mismo, a la misma escala. A 1440×900
   la tira de cuatro muros ocupa ≈14 % del lienzo (cada muro ≈230×120 px); en un teléfono cada muro mide ≈72×38 px y
   las etiquetas se pisan. En *Outputs* y *System* el lienzo no pinta nada relacionado con la tarea.
2. **Casi nada se manipula directamente.** Sensores, máscaras, zonas y píxeles se editan tecleando números
   (`x0 y0 x1 y1` en metros, `X Y W H` en píxeles) o con botones ±1 cm. Lo único directo es dibujar un rectángulo
   nuevo; una vez creado no se puede mover ni redimensionar con el dedo.
3. **No existe un sistema de sala.** Crear una sala es «+ New» dentro de *System* y un nombre; el resto es rellenar
   campos sin orden ni guía. No hay mapeo en el sentido de *projection mapping* (esquinas, rejilla): cada muro es un
   rectángulo alineado a ejes dentro del lienzo de vídeo.
4. **La calibración, que es la tarea crítica de la tablet, no está diseñada para la tablet.** Durante la calibración el
   lienzo sigue mostrando los cuatro muros, las dianas miden unos pocos píxeles, los botones son pequeños, no hay
   sonido ni vibración, no se explica por qué no captura y el resultado es una tabla sin mapa de error ni verificación.
5. **El emparejamiento falla en silencio.** El QR codificaba la primera interfaz de red (Ethernet 172.17.1.51 en vez
   de la Wi‑Fi 172.16.2.42) y no había regla de cortafuegos de entrada. La app no sabía ninguna de las dos cosas ni
   podía decirlo. Una tablet sin clave ve «Connection to the engine lost — Reconnecting…» para siempre.

### La idea central

> **Cada herramienta es un espacio de trabajo.** Al cambiar de herramienta cambian tres cosas a la vez: *qué
> representa el lienzo* (planta de la sala, un muro en alzado, el lienzo de vídeo en píxeles, o un monitor de señal),
> *qué se puede agarrar* (asas, giros, esquinas, puntos de rejilla) y *qué barra de herramientas aparece*. El panel
> lateral deja de ser el sitio donde se trabaja y pasa a ser el **inspector** de lo seleccionado.

Sobre esa base, las herramientas se ordenan como una **puesta en marcha guiada** (`Room → Mapping → Sensors →
Calibrate → Zones → Outputs`) con estado de avance visible, separada del modo de operación (`Live`). Es el patrón de
las «páginas» de DaVinci Resolve o los módulos de Lightroom: el orden de la barra *es* el orden del trabajo.

### Los cinco cambios principales

| # | Cambio | Qué resuelve |
|---|---|---|
| 1 | **Espacios de trabajo por herramienta con manipulación directa** (foco en un muro, asas de mover/redimensionar/girar, ajuste a rejilla, deshacer) | El lienzo deja de ser decorativo; se acaba teclear coordenadas |
| 2 | **Sistema de sala y de mapeo**: constructor de sala (plantillas, dimensiones, plano) y editor de **Mapping** por muro (rectángulo → esquinas → rejilla con puntos añadibles), editable en el escritorio y **en la pared real** desde la tablet | «Un sistema de mapeo de sala, mover esquinas, mover grilla, agregar puntos» |
| 3 | **Calibración en modo foco para tablet**, con la pose del sensor separada del mapeo, realimentación en la propia pared, mapa de error, «rehacer el peor punto» y paso de verificación | La tarea crítica dentro de la sala oscura |
| 4 | **Salidas como enrutado de formatos**: datos (OSC/TUIO/WebSocket), **disparadores OSC** por zona y **textura de vídeo** (máscara en blanco y negro por Spout/NDI, reutilizando los addons de VEATION), con monitor de lo que se envía y pruebas reales | «Elegir formatos de salida… textura blanco y negro o datos OSC para triggers» |
| 5 | **Emparejamiento que se diagnostica solo** (selector de red, estado del cortafuegos con arreglo, confirmación en vivo de que la tablet llegó, código de 6 dígitos como alternativa al QR, pantalla «not paired» en lugar de «Reconnecting…») | «No me funcionó el QR» |

Lo que **no** se propone cambiar: la pila (JS sin compilación, Canvas2D, estado autoritativo en el motor), los tokens
de VEATION, el presupuesto de dos acentos y el contrato OSC/TUIO/WebSocket publicado. Todo lo nuevo en salidas es
aditivo.

---

## 2. Diagnóstico de la interfaz actual

### 2.1 Problemas transversales

| ID | Problema | Evidencia | Sev. | Principio vulnerado |
|---|---|---|---|---|
| T1 | El lienzo es idéntico en las 7 herramientas | `setView()` sólo cambia `rv.mode` y el texto de `#stageHint`; `RoomView.draw()` no conoce la herramienta | **4** | Correspondencia sistema–tarea; el usuario lo ha señalado textualmente |
| T2 | Modos invisibles | El lienzo tiene tres modos (`select`, `draw`, `hand`) que sólo se anuncian en una línea de 10 px en `--ink-3` abajo a la izquierda. `--ink-3` tiene Lc −38: la propia regla de VEATION dice que «no es texto de cuerpo» | **3** | Visibilidad del estado del sistema |
| T3 | Edición por coordenadas | Zonas y máscaras: cuatro campos `x0 y0 x1 y1` sin etiqueta semántica; sensores: `X`, `Y`, `Rotation` con ±; píxeles: `X Y W H` | **3** | Manipulación directa (Shneiderman); reconocer antes que recordar |
| T4 | Escala inútil del lienzo | Tira de 4 muros = 28 m × 3,5 m (8:1) en un lienzo ≈1036×842 px → ≈14 % de área útil. Seleccionar un muro, un sensor o una zona **no** encuadra nada | **3** | Ley de Fitts; economía de pantalla |
| T5 | El panel se reconstruye entero con cada evento | `panel.replaceChildren(...)` en cada `state`, `status` (2 Hz) y `live` (hasta 4 Hz). Sólo se protege el foco de `INPUT/SELECT`. En táctil, un botón puede ser sustituido entre `pointerdown` y `click` → toques perdidos intermitentes, sobre todo en *Live* | **3** | Estabilidad; control del usuario |
| T6 | Sin deshacer | Ninguna acción se puede deshacer. Borrar una zona no pide confirmación ni ofrece «Undo». El motor ya guarda 30 copias por perfil, pero la UI no las expone | **3** | Control y libertad del usuario |
| T7 | Sin flujo ni estado de puesta en marcha | Las 7 herramientas son pestañas planas. Nada indica qué falta (fondo sin capturar, muro sin calibrar, salida sin destino) salvo entrar a mirar | **3** | Divulgación progresiva; prevención de errores |
| T8 | Cambiar de sala es un clic sin confirmación | El `<select>` «Room» de la barra superior ejecuta `profile.load` al instante: para sensores, corta salidas y cancela una calibración en curso. En plena función es un accidente a un toque | **3** | Prevención de errores |
| T9 | Un único aviso para tres averías distintas | La cortina «Connection to the engine lost — Reconnecting…» aparece igual si el motor se reinicia, si cae la red o si el dispositivo **no tiene clave** (el servidor responde 401 y el cliente reintenta sin fin) | **3** | Mensajes de error que diagnostican |
| T10 | Objetivos táctiles por debajo del mínimo | Con puntero grueso: controles 38 px, `.btn.small` 34 px, interruptor 42×24 px, botones ± 38 px. Con ratón: 22/18 px. El mínimo razonable en táctil es 44–48 px | **2** | Ley de Fitts; WCAG 2.5.5 |
| T11 | La disposición depende sólo del ancho | El corte está en 900 px. Un iPad apaisado (1024–1366) recibe la disposición de escritorio con un panel de 400 px: el lienzo se queda en ≈550 px de ancho para una tira de 28 m | **2** | Diseño por contexto de uso |
| T12 | Controles duplicados y dispersos | «Off / Identify / Debug» está en la barra superior y otra vez en *System*; en pantallas ≤900 px desaparece de la barra junto con «Connect device». Perfiles, emparejamiento, procesado y registro comparten un mismo cajón (*System*) | **2** | Consistencia; arquitectura de información |
| T13 | Rojo usado para algo que no es un fallo | Las máscaras se pintan en `--danger`. Una máscara no es un error; el rojo debería quedar para sensor caído u objeto rechazado | **1** | Color con significado (regla de dos acentos) |
| T14 | Formato numérico mezclado | Los campos muestran coma decimal por la configuración regional («3,8», «0,03») y las etiquetas del lienzo punto («7.35 × 3.50 m») | **1** | Consistencia |

### 2.2 Por vista

**Live.** Funciona como monitor, pero no como panel de operación. La lista «Walls» repite lo que ya dice el lienzo; el
registro de eventos (10 px) es ilegible a un brazo de distancia; no hay resumen de salud ni de incidentes («S3 se
desconectó a las 21:14 y volvió»), ni actividad de las salidas. El interruptor «Virtual hands» vive en el panel pero
cambia el modo del lienzo (T2). Las etiquetas de identificador de los toques (números de 3–4 cifras) tapan el propio
toque. **Sev. 2.**

**Room.** La única vista previa del reparto de píxeles es una miniatura de 120 px de alto, no interactiva. Añadir un
muro crea uno de 4 × 2,5 m en `0,0 1920×1080`, solapado con los existentes y sin aviso; no hay detección de solapes ni
de rectángulos fuera del lienzo. El orden de los muros se cambia con «← Move left / Move right →». Las máscaras se
listan como filas de cuatro números sin nombre y sus botones de borrado van aparte. No hay forma de expresar
*keystone* ni una superficie irregular. **Sev. 3.**

**Sensors.** La instrucción clave —«Rotate until the live floor line lies on y = 0»— exige ver la nube de puntos, pero
los puntos miden 1,1 px y, a la escala de la tira, la línea del suelo no se distingue. El giro se ajusta con ±0,5° a
ciegas. Seleccionar un sensor no encuadra su muro. No hay descubrimiento de sensores, ni comprobación de que el PC
tiene dirección en la subred de los sensores, ni forma de saber cuál de los cuatro sensores físicos es «S2». El estado
(«State / Revolutions / Packets / CRC…») es una tabla de once filas sin jerarquía: lo que importa (¿llegan datos?,
¿cuántos reinicios?) pesa lo mismo que el número de serie. **Sev. 3.**

**Calibrate.** La lista previa («Before you start») es un acierto y se conserva. Los problemas:
- El botón «Start calibration» está habilitado sin fondo capturado y falla con un aviso emergente. **Sev. 2.**
- Durante la sesión el lienzo sigue mostrando los cuatro muros; el muro que se calibra ocupa ≈160×85 px en una tablet
  y los números de las dianas se solapan. La mitad inferior de la pantalla queda vacía. **Sev. 3.**
- «← Back», «Skip target» y «Cancel» miden 22–38 px y están pegados; «Cancel» (destructivo) queda a 8 px de «Skip».
  **Sev. 3** con la tablet en una mano.
- Si el sensor ve dos objetos (el operador y otra persona, o una mano y un codo) el candidato se descarta en silencio:
  la pantalla dice «Touch and hold…» y no pasa nada. **Sev. 3.**
- En el simulador, las manos errantes siguen activas en el muro que se calibra y son capturadas como si fueran el
  operador (se observó «Hold still…» sin tocar nada). **Sev. 2.**
- Sin sonido ni vibración; el operador tiene que mirar la tablet para saber si capturó, cuando su atención está en la
  pared. **Sev. 2.**
- El resultado es una tabla (RMS, peor punto). No hay mapa de dónde está el error, «Back» sólo retrocede desde el
  último punto y no existe un paso de verificación tocando libremente. **Sev. 3.**
- La rejilla de dianas sólo cubre la franja alcanzable (0,45–1,9 m) de un muro de 3,5 m, y con esos puntos se ajusta
  una homografía de 8 grados de libertad que luego se extrapola a toda la altura. Es un problema de modelo, no sólo de
  interfaz (ver §3.5). **Sev. 3 [validar con hardware].**

**Zones.** El lienzo queda permanentemente en modo dibujo: arrastrar con un dedo **siempre** crea una zona, así que no
se puede desplazar la vista con un dedo y es fácil crear zonas por accidente. Una zona existente no se puede mover ni
redimensionar salvo por sus cuatro números. No hay ajuste a rejilla, duplicado ni alineación. **Sev. 3.**

**Outputs.** El lienzo no aporta nada. No se ve qué se está enviando: sólo «3670 sent». «Send test» envía un único
`/vt/test`, que no prueba lo que el receptor realmente va a consumir. Visto desde el propio servidor, la URL de
WebSocket muestra `ws://localhost:8770/ws/data`, que no sirve para otra máquina. No hay textura de vídeo ni
disparadores configurables. **Sev. 3.**

**System.** Cajón de sastre: emparejamiento, perfiles, 16 campos de procesado sin «restablecer» ni explicación visual,
aplicación, proyección y registro. Los nombres de perfil se cortan («Barcelona X…») porque comparten fila con cuatro
botones. **Sev. 2.**

**Emparejamiento (estado actual tras el arreglo de hoy).** Ya hay selector de red (Wi‑Fi primero) y un texto de ayuda,
y el instalador añade la regla de cortafuegos. Sigue siendo **estático**: no comprueba el cortafuegos, no confirma
que la tablet llegó, los botones del selector no caben en el panel de 340 px («Wi‑Fi · 172.16.2.42 | Ethernet ·
172.17.1.51» sale cortado) y ofrece como candidata cualquier interfaz Ethernet, incluida la de los sensores. **Sev. 3.**

**Projection.** Los modos «Identify» y «Debug» son útiles, pero se eligen con un control sin etiqueta. No hay patrón
para ajustar el mapeo (esquinas, rejilla) ni cursor de verificación. **Sev. 2.**

### 2.3 Por tamaño de pantalla

| Tamaño | Qué ocurre | Sev. |
|---|---|---|
| **Escritorio 1440×900** | Tres columnas correctas, pero el lienzo desaprovecha ≈86 % del área y el panel obliga a desplazarse (el editor de sensor mide 1133 px de alto). Texto base de 11 px, coherente con VEATION | 2 |
| **Tablet vertical 768×1024** | Lienzo arriba (42 %) y panel abajo. El muro que interesa mide ≈160×85 px. Desaparecen «Connect device» y el selector de proyección. La barra de pestañas inferior funciona bien (51 px de alto) | 3 |
| **Tablet apaisada (≥1024)** | Recibe la disposición de escritorio (T11) con panel fijo de 400 px | 3 |
| **Teléfono 375×812** | Cada muro ≈72×38 px; «6.48 × 3.50 m» y «1 touch» se superponen; el nombre de la sala se corta («Barcelona XR Lal»). Editar geometría es inviable; como monitor es aceptable | 3 |

### 2.4 Lo que funciona y se conserva

- La tira de muros a una sola escala métrica (heredada de VEATION) es buena **como vista general y como navegador**.
- Estado autoritativo en el motor con revisiones, edición optimista y escrituras atómicas con copias.
- Lista de requisitos antes de calibrar; anillo de progreso; orden en serpentina de las dianas.
- Simulador con manos virtuales: imprescindible para diseñar y probar sin hardware.
- Tokens, dos acentos, Geist autoalojada; pestañas inferiores en pantallas estrechas.
- La protección de no reconstruir el panel con un campo enfocado (se generaliza en §3.12).

---

## 3. Nuevo modelo de interacción

### 3.1 Principios

1. **El objeto se toca donde está.** Si algo tiene posición o tamaño, se mueve y se redimensiona en el lienzo. Los
   números siguen existiendo en el inspector, para precisión, nunca como única vía.
2. **Un muro cada vez.** El trabajo fino (sensores, calibración, zonas, mapeo) se hace con un muro encuadrado a
   pantalla completa; la tira pasa a ser el navegador entre muros.
3. **El modo siempre se ve.** La herramienta activa se muestra en una barra propia sobre el lienzo, no en una línea de
   ayuda. Cambiar de herramienta cambia el cursor, las asas y el título.
4. **Divulgación progresiva.** Rectángulo antes que esquinas, esquinas antes que rejilla; ajustes de procesado
   plegados tras «Advanced»; el asistente sólo pregunta lo que hace falta para llegar al siguiente paso.
5. **Todo se puede deshacer.** Los borrados no preguntan: se ejecutan y ofrecen «Undo» durante 8 s. Las confirmaciones
   quedan para lo que afecta a la función en curso (cambiar de sala, parar sensores).
6. **La pared es la pantalla principal dentro de la sala.** Mientras el operador está tocando, la realimentación va
   primero a la proyección, después al sonido y la vibración, y por último a la tablet.
7. **La app sabe lo que le falta y lo dice.** Cada paso de la puesta en marcha muestra su estado y el motivo exacto por
   el que no está listo, con la acción para resolverlo al lado.

### 3.2 Estructura general

```
┌─ Top bar ─ marca · Room ▾ · [ SETUP | SHOW ] ·········· salud · dispositivos · Projection ▾ ─┐
├──────┬───────────────────────────────────────────────────────────────────────┬───────────────┤
│ Rail │ Barra de herramientas del espacio (contextual)        Fit  +  −  ⟲ ⟳ │ Inspector     │
│      ├───────────────────────────────────────────────────────────────────────┤ (lo           │
│      │                                                                       │ seleccionado; │
│      │                  LIENZO = espacio de trabajo                          │ si no hay     │
│      │   (planta · muro en alzado · lienzo de vídeo en px · monitor)         │ selección,    │
│      │                                                                       │ resumen y     │
│      ├───────────────────────────────────────────────────────────────────────┤ siguiente     │
│      │ Navegador de muros:  [All] [P1 ●] [P2 ●] [P3 ●] [P4 ●]                │ paso)         │
├──────┴───────────────────────────────────────────────────────────────────────┴───────────────┤
└─ Status ─ ayuda de la herramienta · coordenadas bajo el cursor · sala · motor ────────────────┘
```

**Dos modos: `SETUP` y `SHOW`.** `SHOW` es la operación diaria (vista *Live*, edición bloqueada, controles de
emergencia). `SETUP` abre la puesta en marcha. La separación evita el problema T8 (tocar algo estructural durante la
función) y permite que la tablet de sala arranque siempre en `SHOW`.

**El rail como lista de pasos.** En `SETUP` el rail muestra los seis pasos en orden, cada uno con un indicador:

| Paso | Indicador «listo» | Ejemplos de «falta» |
|---|---|---|
| 1 `Room` | ≥1 muro con medidas | «No walls yet» |
| 2 `Mapping` | todos los muros dentro del lienzo y sin solapes | «P3 overlaps P4», «P1 outside canvas» |
| 3 `Sensors` | todos escaneando y con fondo | «S3 offline», «2 without background» |
| 4 `Calibrate` | todos calibrados por debajo del umbral | «P2 not calibrated», «P4 18 mm RMS» |
| 5 `Zones` | opcional (muestra el número) | — |
| 6 `Outputs` | ≥1 destino activo sin errores | «No destination enabled» |

Los pasos **no bloquean**: se puede saltar a cualquiera (un técnico con experiencia no necesita asistente), pero el
indicador y el inspector vacío siempre dicen qué falta y ofrecen el botón que lo resuelve. `System` deja de ser una
herramienta y pasa a ser un panel de ajustes (icono de engranaje al pie del rail).

**Espacios del lienzo.** Hay cuatro representaciones; cada herramienta usa la que le corresponde:

| Espacio | Qué muestra | Unidades | Lo usan |
|---|---|---|---|
| **Plan** | La sala vista desde arriba: muros como segmentos, sensores, «estás aquí» | metros | `Room`, mini-mapa en tablet |
| **Wall** | Un muro en alzado, visto desde dentro, con margen para ver el sensor, el suelo y las paredes vecinas | metros | `Sensors`, `Calibrate`, `Zones`, `Mapping` (lado físico) |
| **Output** | El lienzo de vídeo con la región de cada muro | píxeles | `Mapping`, vista previa de textura en `Outputs` |
| **Strip** | Todos los muros desenrollados a una escala (la vista actual) | metros | `Live`, vista general de cualquier paso |

**Navegador de muros.** Franja inferior del lienzo con una miniatura por muro (familia directa de la tira de sala 360
de VEATION). Cada miniatura muestra toques en vivo y la insignia del paso activo (LED del sensor en `Sensors`, RMS en
`Calibrate`, número de zonas en `Zones`). Tocar una miniatura encuadra ese muro con una transición de 250 ms (la
cámara viaja, no salta: se conserva la orientación). `All` vuelve a la tira. Teclas `[` y `]`, o deslizar con dos
dedos, pasan al muro contiguo.

**Selección e inspector.** Una única selección global (`wall`, `sensor`, `zone`, `mask`, `point`, `output`). Seleccionar
en el lienzo, en una lista o en el navegador es lo mismo. El inspector muestra sólo esa selección; sin selección
muestra el resumen del paso y el siguiente requisito pendiente. En tablet vertical el inspector es una **hoja
inferior** con tres alturas (asomada 72 px · media · completa); en tablet apaisada, un cajón derecho plegable.

> **`[REF lidar-ui]` — espacio de trabajo por modo.** Contrastar con el análisis: qué muestra su vista central en cada
> modo (nube de puntos 3D con selector de área, panel remoto), cómo pasa de «montar» a «rastrear» a «calibrar», y si
> su vista principal es la nube de puntos del sensor (centrada en el sensor) o la superficie (centrada en el muro).
> Esta propuesta centra el trabajo en el **muro**; si la referencia demuestra que montar y nivelar se entiende mejor
> desde la **vista del sensor**, el espacio `Wall` de `Sensors` (§3.6) debe ofrecer ambas.

**Deshacer.** `⟲ ⟳` en la barra del lienzo y `Ctrl+Z / Ctrl+Shift+Z`. La pila es del perfil, en el motor (ver Anexo A),
de modo que deshacer funciona igual desde el escritorio y desde la tablet.

### 3.3 Gramática de manipulación directa

Las mismas piezas en todas las herramientas, para que se aprendan una vez:

| Pieza | Aspecto | Gesto | Dónde |
|---|---|---|---|
| **Cuerpo** | relleno del objeto | arrastrar = mover | zonas, máscaras, región de un muro, sensor |
| **Asas de tamaño** | 8 cuadrados de 10 px (zona táctil 44 px) | arrastrar = redimensionar; `Shift` conserva proporción | zonas, máscaras, rectángulo de píxeles |
| **Asa de esquina** | círculo de 12 px | arrastrar = mover esa esquina | mapeo en esquinas |
| **Punto de rejilla** | círculo de 10 px; el activo en ámbar | arrastrar; flechas = 1 px; `Shift`+flechas = 10 px | mapeo en rejilla |
| **Anillo de giro** | arco a 28 px del sensor con una marca de dirección | arrastrar alrededor = girar; cerca del anillo ajusta a 90° | sensor |
| **Lectura flotante** | etiqueta junto al asa: `x 1.20  y 0.85  ·  0.60 × 0.40 m` | aparece al arrastrar | todas |
| **Guías de ajuste** | líneas discontinuas en `--line-strong` | aparecen al alinearse con rejilla, bordes, centro u otros objetos | zonas, máscaras, regiones |
| **Lupa** | círculo de 96 px sobre el dedo con la zona ampliada ×3 | aparece al arrastrar un asa en táctil | todas (el dedo tapa el asa) |

Reglas de gesto:

- **Ratón:** clic selecciona; arrastrar un objeto lo mueve; arrastrar en vacío desplaza la vista; rueda = zoom;
  doble clic en un muro lo encuadra. Con la herramienta de dibujo activa, arrastrar en vacío dibuja.
- **Táctil:** un toque selecciona; arrastrar un objeto **ya seleccionado** lo mueve; arrastrar en vacío desplaza;
  dos dedos = zoom y desplazamiento. Dibujar exige elegir antes la herramienta de dibujo, que se desactiva sola tras
  crear un objeto (evita las zonas accidentales de hoy).
- **Precisión:** todo objeto seleccionado admite empujones con flechas (o con el teclado de flechas en pantalla en
  tablet): 1 cm / 1 px por pulsación, ×10 con `Shift` o con el paso «coarse».
- **Ajuste (snap):** rejilla de 5 cm por defecto (1 cm con zoom alto), bordes y centros del muro, bordes de otros
  objetos. Interruptor en la barra; `Alt` lo suspende mientras se mantiene.
- **Confirmación con el motor:** durante el arrastre la vista previa es local (sin tráfico); al soltar se envía un
  único cambio. Si otro dispositivo cambió el perfil mientras tanto, el motor rechaza la revisión y el objeto vuelve
  a su sitio con un aviso «Changed on another device — reloaded» (comportamiento actual, ahora visible).

### 3.4 Room — constructor de sala

**Para qué sirve.** Describir la sala física: cuántos muros, cuánto miden, cómo se disponen. Nada de píxeles aquí.

**Lienzo: espacio Plan.** La sala vista desde arriba, con rejilla de 0,5 m. Cada muro es un segmento grueso con su
identificador, su longitud y una flecha corta que marca la cara interactiva (hacia dentro de la sala). Los sensores
aparecen como puntos sobre su muro. Un conmutador `Plan | Strip` permite ver la misma sala desenrollada.

**Asas.** Extremos de cada muro (mover = cambiar longitud y ángulo, con ajuste a 0/45/90° y a extremos de otros
muros); cuerpo del muro (mover entero); pastilla de longitud editable en línea (tocar el «6.48 m» y teclear).

**Barra de herramientas.** `Select` · `Wall` (dibujar un muro arrastrando) · `Polyline` (trazar varios seguidos) ·
`Measure` (regla) · `Plan image…` · `Snap`.

**Inspector.** Sala: nombre, notas, altura por defecto. Muro seleccionado: nombre, identificador, ancho, **alto de la
superficie táctil**, distancia del plano de escaneo, activo. Aviso si el identificador cambia y hay salidas que lo usan
(la dirección OSC incluye el identificador).

**Tres maneras de crear la sala** (pantalla de sala vacía y asistente «New room»):

1. **Por plantilla y dimensiones** — la vía rápida. Plantillas: `Single wall`, `Corner (2 walls)`, `Corridor (2 facing
   walls)`, `U (3 walls)`, `Box (4 walls)`, `Custom (N walls)`. Se piden ancho, fondo y alto; los muros se generan ya
   dispuestos y nombrados en sentido horario desde la puerta.
2. **Desde un plano** — se carga una imagen o PDF del plano como fondo, se fija la escala marcando dos puntos y
   tecleando la distancia real, y se trazan los muros encima con `Polyline`. Cada tramo se convierte en un muro.
3. **Duplicando una sala** — copia geometría, zonas y salidas; la calibración se descarta (comportamiento actual).

**Por qué una planta y no sólo la tira.** La tira no dice qué muro es vecino de cuál, ni cuál queda enfrente. Esa
información sirve para tres cosas reales: orientar al operador en la tablet («estás mirando P3»), proponer la pose del
sensor a partir de las paredes vecinas que su plano corta (§3.6) y avisar de interferencias entre sensores enfrentados
**[validar con hardware]**. El motor no la necesita para rastrear, así que es un dato opcional del perfil (Anexo B).

### 3.5 Mapping — mapeo de la sala (esquinas, rejilla, puntos)

Es la pieza nueva más importante y la que pide el director creativo. Conviene fijar primero el modelo, porque cambia
cómo se entiende la calibración.

> **`[REF lidar-ui]` — mapeo.** Contrastar con el análisis: cómo define lidar-ui el área interactiva (ROI por
> proximidad en las cuatro esquinas, selector de área sobre la nube), si permite deformar o sólo recortar, cómo
> relaciona área y salida, y qué vocabulario usa. Lo que sigue es más ambicioso (esquinas + rejilla + píxeles del
> contenido); si la referencia resuelve el 90 % de los casos con «cuatro esquinas tocadas», ese debe ser el camino
> por defecto y la rejilla quedar como nivel avanzado.

#### El modelo: dos transformaciones con oficios distintos

```
 sensor (m)  ──── POSE ────▶  muro (m)  ──── MAPPING ────▶  lienzo de vídeo (px)  ──▶  u,v · textura
              rígida: x, y,              rectángulo → esquinas → rejilla
              giro, espejo               (dónde cae cada punto físico del muro
              «hace métrica la nube»      dentro del contenido)
                                          «hace que el toque coincida con la imagen»
```

- **Pose** (por sensor): dónde está y hacia dónde mira el sensor en el muro. El LiDAR ya mide en metros y su plano es
  paralelo al muro, así que la transformación verdadera es **rígida** (3 números y un espejo). Se obtiene sola a partir
  del suelo y las paredes vecinas, o con 2–3 toques.
- **Mapping** (por muro): cómo se corresponde el muro físico con los píxeles del contenido. Hoy es un rectángulo
  alineado a ejes (`pixelRect`). Pasa a tener tres niveles:

| Nivel | Qué es | Cuándo basta |
|---|---|---|
| `Rect` | Rectángulo (lo de hoy) | La imagen llega geométricamente corregida y cubre exactamente la superficie táctil |
| `Corners` | Cuatro esquinas libres (*corner pin*, interpolación proyectiva) | Hay *keystone* o la imagen no coincide con los bordes del muro |
| `Grid` | Rejilla de puntos de control n×m, con filas y columnas **añadibles** donde haga falta; interpolación suave | Superficie irregular, lente, zonas de solape entre proyectores, muro curvo |

**Por qué separar pose y mapeo** (hoy una única homografía por sensor hace las dos cosas a la vez):

1. **Extrapolación.** Nadie alcanza por encima de ≈1,9 m; el muro mide 3,5 m. Una homografía de 8 grados de libertad
   ajustada sólo con puntos de la franja baja se extrapola mal hacia arriba. Una pose rígida no extrapola: el sensor es
   métrico en todo su alcance. Y las esquinas superiores del mapeo se colocan **a ojo, mirando la proyección**, sin
   tener que tocarlas.
2. **Mantenimiento.** Si alguien golpea un sensor, se rehace la pose (30 s, 3 toques) y la rejilla sigue valiendo. Si
   se realinea un proyector, se retoca el mapeo y los sensores no se tocan. Hoy cualquiera de las dos cosas obliga a
   recalibrar entero.
3. **Varios sensores por muro.** Con poses rígidas, dos sensores coinciden en metros y comparten un único mapeo. Con una
   homografía por sensor, pueden discrepar en la zona que ven ambos.
4. **Distorsión no proyectiva.** Una homografía no puede absorber una lente, un muro curvo ni un solape; la rejilla sí.

**Compatibilidad.** Con `Rect` el resultado es idéntico al actual, y la salida `u, v` sigue significando lo mismo
(«0–1 con origen arriba a la izquierda del muro»): se calcula sobre la región de contenido del muro después del
mapeo. El contrato de `docs/OSC.md` no cambia. La homografía por sensor se mantiene como opción avanzada
(`Per-sensor projective fit`) hasta que las pruebas con sensores reales digan cuál rinde mejor **[validar con
hardware]**.

#### El punto clave: las dianas de calibración *son* puntos del mapeo

La ventana de proyección dibuja en píxeles del lienzo de vídeo y pasa por la misma cadena (Datapath, proyectores,
deformación) que el contenido. Por tanto, **lo que Touch dibuja en el píxel (px, py) cae en la pared exactamente
donde caerá el píxel (px, py) del contenido**. Cuando el operador toca una diana proyectada, el sistema conoce a la
vez su píxel exacto y la posición métrica que mide el sensor. Cada toque es una correspondencia píxel ↔ metro, es
decir, un punto de control de la rejilla medido en vez de arrastrado.

De ahí salen tres formas de colocar un punto, que conviven:

| Forma | Cómo | Para qué puntos |
|---|---|---|
| **Drag** | Arrastrar el asa en el escritorio (vista `Output`) | Reparto inicial de regiones; ajuste fino con el contenido de fondo |
| **Nudge on wall** | La proyección dibuja el punto; el operador lo mueve desde la tablet hasta que cae sobre la referencia física (esquina del muro, marca de cinta) | Esquinas y borde superior, fuera del alcance de la mano |
| **Touch to pin** | El operador toca la marca proyectada; el sensor mide dónde está | Todos los puntos alcanzables; es la calibración |

#### Lienzo: dos vistas enlazadas

- **Vista `Output`** (principal en escritorio): el lienzo de vídeo completo con la región de cada muro. En `Rect`,
  rectángulos con asas de tamaño; en `Corners`, cuadriláteros con cuatro asas; en `Grid`, la malla con sus puntos.
  Fondo opcional `Content underlay`: una captura del contenido real (imagen fija; más adelante, entrada Spout/NDI en
  vivo, que los addons de VEATION ya saben recibir) para ajustar las regiones sobre lo que de verdad se proyecta.
- **Vista `Wall`** (principal en tablet): el muro en metros con la misma rejilla y los toques en vivo ya mapeados.

En escritorio se muestran lado a lado (`Output | Wall`), con el punto seleccionado resaltado en ambas. En tablet se
muestra una y se conmuta.

#### Barra de herramientas

`Select` · nivel `Rect | Corners | Grid` · `Add row` · `Add column` (tocar dentro de la malla inserta la línea en ese
sitio; los puntos nuevos nacen **sobre la superficie actual**, así que nada se mueve hasta que se arrastran) ·
`Remove line` · `Reset` · `Snap` (bordes y mitades del lienzo, bordes de otros muros) · `Layout…` (repartos rápidos:
`1×N`, `2×2`, `N×1`, a partir del tamaño del lienzo) · `Show on wall` (activa el patrón en la proyección).

#### Inspector

Lienzo de vídeo (ancho × alto). Muro: región de contenido `X Y W H`, nivel de mapeo, tamaño de la rejilla. Punto
seleccionado: nombre (`B3`), píxel `x, y`, posición física `x, y` en metros, origen (`dragged` / `nudged` /
`touched`), residuo en mm. Avisos: `Overlaps P4`, `Outside canvas`, `Grid folded` (la malla se cruza sobre sí misma).

#### Edición en la pared real

Con `Show on wall`, la ventana de proyección entra en modo `Mapping`: dibuja la malla del muro activo, todos sus puntos
con su nombre, y el punto seleccionado en ámbar con una cruz grande. La tablet se convierte en un mando:

- una miniatura del muro para **elegir** el punto (o `◀ ▶` para recorrerlos);
- un **panel táctil** para moverlo: arrastrar en cualquier parte del panel desplaza el punto de forma relativa (como
  un *trackpad*: el dedo no tiene que estar sobre el punto ni lo tapa), con dos velocidades (`1:1` y `fine 1:10`);
- flechas de empujón con paso `1 / 5 / 25 px`;
- `Touch to pin`: «camina hasta la marca y tócala» — el sistema fija ese punto con la medida del sensor.

Es el mismo gesto que el ajuste de esquinas de MadMapper o de la salida avanzada de Resolume (mover la marca hasta que
cae en la referencia), con una diferencia que conviene decir en la interfaz: **Touch no deforma el contenido**; ajusta
su *modelo* de dónde cae el contenido. Texto del inspector: «This does not change your image. It tells Touch where
your image lands on the wall.»

#### Cuando no se puede proyectar desde Touch

Si el contenido sale de otra máquina y la ventana de proyección no puede ocupar esa salida, hay dos fuentes
alternativas de dianas (se eligen en el paso previo de `Calibrate`):

- **`Pattern over Spout / NDI`**: Touch emite el patrón (dianas, rejilla, identificadores) como textura; TouchDesigner
  o Unreal lo componen encima del contenido. Reutiliza la salida de textura de §3.9.
- **`Physical marks`**: sin proyectar nada. El operador toca las cuatro esquinas de la imagen (o marcas de cinta en
  posiciones medidas). Es la calibración «por gesto en las cuatro esquinas» que usa lidar-ui, ampliable a más puntos.

### 3.6 Sensors — colocar, girar, nivelar, vigilar

**Lienzo: espacio Wall ampliado.** El muro elegido en alzado, con margen suficiente para ver el sensor encima, la línea
del suelo y el arranque de las paredes vecinas. Sobre él:

- la **nube en vivo** con puntos de 2–3 px (blanco = primer plano, gris = fondo), y la huella del último segundo
  atenuada para que el ruido se vea como grosor;
- la **geometría esperada** como líneas finas: suelo (`y = 0`), bordes del muro (`x = 0`, `x = W`), techo;
- el **sensor** como un glifo con su anillo de giro y un abanico tenue que marca su alcance y su sector ciego;
- lo que el sensor ve **dentro** del rectángulo del muro con la sala vacía, resaltado: es el plano rozando la pared.

Un conmutador `Wall view | Sensor view` permite ver la misma nube centrada en el sensor (polar, como la ven las
herramientas de Slamtec), útil mientras todavía no se sabe dónde está montado.

**Asas.** Cuerpo del sensor (arrastrar = `x, y`), anillo de giro (arrastrar alrededor; ajuste a −90°), botón `Flip`
junto al glifo (espejo, para sensores montados boca abajo). Mientras se arrastra, la nube se recoloca en vivo: el
criterio de acierto es **visual** —la línea gris del suelo cae sobre `y = 0` y las paredes vecinas sobre los bordes—,
que es justo lo que hoy pide el texto de ayuda y no se puede ver.

**Barra de herramientas.** `Select` · `Auto-align` · `Capture background` · `Level check` · `Add sensor ▾` (`Scan
network…`, `Add by IP…`, `Simulated`) · capas `Points | Background | Detections | Rejected`.

- **`Auto-align`** ajusta rectas a los retornos del fondo (suelo y paredes vecinas) y propone la pose que las hace
  coincidir con el rectángulo del muro. Muestra la propuesta como un fantasma («before / after») y pide `Apply`. Es la
  «fase geométrica» de la patente de Immersive Gamebox que recoge la investigación. **[validar con hardware]**
- **`Level check`** — ayuda de nivelado. Un LiDAR 2D no puede medir directamente la inclinación de su propio plano
  respecto al muro; sí puede dar tres indicios, y la herramienta los reúne en una sola pantalla:
  1. *Wall grazing*: retornos estáticos dentro del muro → el plano toca la pared (o un rodapié, o una panza). Se
     dibujan en `--danger` con la indicación del lado: «The scan plane touches the wall on the lower left — tilt the
     sensor away from the wall».
  2. *Floor line*: la línea del suelo debe verse completa de lado a lado. Si le faltan tramos, el plano se ha metido en
     la pared antes de llegar al suelo.
  3. *Depth probe*: el operador apoya una galga impresa (una tarjeta con escalones de 2 y 5 cm) en cinco puntos que la
     proyección le va marcando. La app anota en cuáles la detecta y con qué escalón, y dibuja en cada punto la distancia
     estimada plano–pared con una flecha de corrección («bottom right ≈ 5 cm: tilt towards the wall»).
  
  Los tres son hipótesis de diseño hasta medir el S2E real (planitud ±1,5°, distancia óptima). **[validar con
  hardware]**

**Inspector.** Arriba, lo que importa: un bloque de **salud** con cuatro lecturas grandes —`Data` (edad del último
paquete), `Rate` (Hz), `Restarts` (última hora), `Background` (edad de la captura)— y una gráfica de los últimos 10 min
con los cortes marcados. Después: nombre, muro, IP y puerto, modo de escaneo, velocidad del motor. Plegado tras
`Details`: firmware, serie, CRC, paquetes/s. Acciones: `Restart`, `Identify` (ver abajo), `Capture background`,
`Clear`, `Delete`.

**Saber qué sensor es cuál.** Dos ayudas: `Identify` hace parpadear el glifo y su miniatura mientras alguien agita la
mano delante del sensor físico («Activity» sube en el que se mueve); y la lista de sensores se puede **arrastrar sobre
un muro** del navegador para asignarlo.

**Estados del sensor en el lienzo.** `scanning` (anillo verde fino, nube viva) · `connecting` (ámbar pulsante, «waiting
for first packet… 8 s») · `offline` (rojo, el muro se raya en diagonal y muestra «S3 offline · retrying in 4 s» con
`Restart now`) · `disabled` (gris) · `no background` (insignia ámbar) · `not placed` (glifo punteado).

> **`[REF lidar-ui]` — montaje.** Contrastar con el análisis: qué enseña lidar-ui durante el montaje (nube 3D, ejes,
> cono), qué controles ofrece para orientar el sensor y qué realimentación da de que está bien colocado. Si incluye una
> ayuda de nivelado que funcione en la práctica, sustituye a `Level check`.

### 3.7 Calibrate — modo foco

**Antes de empezar (pantalla previa).** Se conserva la lista de requisitos, con tres cambios: el botón de inicio queda
deshabilitado **con el motivo escrito** hasta que se cumplen; se elige la **fuente de dianas** (`Projection window` ·
`Pattern over Spout/NDI` · `Physical marks`); y se elige el **alcance** de la sesión:

| Sesión | Qué pide | Cuándo |
|---|---|---|
| `Quick (pose only)` | 3 toques | Se movió un sensor; primera comprobación |
| `Standard` | 3×3 dianas en la franja alcanzable + esquinas superiores «a ojo» | Puesta en marcha normal |
| `Fine (grid)` | Rejilla más densa y puntos extra donde el error sea alto | Superficies irregulares; cuando `Standard` no baja del umbral |

**Durante la sesión — en la pared.** La proyección es la pantalla principal:

- una sola diana activa, grande (≈30 cm), en ámbar, «respirando»; las pendientes, atenuadas; las hechas, con una marca;
- al apoyar la mano, el anillo se llena; al capturar, **destello** de la diana y texto `Release`;
- una flecha fina desde la diana hecha hasta la siguiente con la distancia («→ 2.1 m»), para no tener que buscarla;
- si el sensor ve algo que no es una sola mano, la diana lo dice ahí mismo: `Only one hand on the wall` (dos objetos),
  `Step back — body too close` (objeto grande rechazado), `Not seen — move your hand flat` (nada).

**Durante la sesión — en la tablet.** Pantalla completa, sin rail ni inspector, pensada para sujetarla con una mano:

- arriba: muro, sensor(es) y puntos de progreso (`● ● ● ○ ○ ○ ○ ○ ○`);
- centro: el muro encuadrado con las dianas grandes y el anillo; el fondo de toda la pantalla cambia de estado
  (neutro → ámbar tenue al sostener → destello al capturar), de modo que se percibe con visión periférica;
- abajo, en la zona del pulgar, tres botones de 64 px: `Undo last` · `Skip` · `Pause`. `Cancel` no está aquí: va en un
  menú `⋯` arriba, con confirmación, para que no se pulse por error;
- sonido (tres señales: captura, problema, fin) y vibración donde el navegador la permite (§6).

**Reglas de la sesión.** Las manos errantes del simulador se pausan en el muro que se calibra. La sesión bloquea la
edición en los demás dispositivos conectados, que la ven en modo lectura con un aviso «Calibration in progress on
Tablet 1». Si el operador se queda sin tocar 60 s, la sesión se pausa sola, no se cancela.

**Esquinas superiores.** Tras las dianas alcanzables, el paso `Top corners` pide ajustar con el mando de §3.5 las dos
esquinas de arriba mirando la proyección. Se puede omitir si la imagen llega corregida (`Rect`).

**Resultado.** En vez de una tabla, el muro con un **mapa de error**: en cada diana, un vector que marca hacia dónde y
cuánto se desvió (exagerado ×10), con el valor en mm. Encima, tres cifras: `RMS`, `Worst`, `Leave-one-out` (el error
al predecir cada punto sin usarlo: detecta sobreajuste de la rejilla). Acciones: `Redo worst point` (un toque: vuelve
sólo a esa diana), `Add point` (tocar la pared donde se quiera reforzar), `Apply`, `Discard`. Umbrales por defecto:
≤10 mm excelente, ≤20 mm aceptable, por encima se propone `Fine`. **[validar con hardware]**

**Verificación (`Verify`).** Paso final, y también herramienta suelta para el día a día. La proyección dibuja un anillo
cian donde el sistema cree que está la mano y deja un rastro; el operador recorre el muro. La tablet muestra la
deriva en reposo (desviación en 3 s) y un botón `Fix here`: si el anillo no coincide con la mano en algún sitio, se
toca ahí y se añade un punto de corrección. Es la prueba que de verdad importa a quien hace el contenido: «el anillo
está debajo de mi mano en todas partes».

> **`[REF lidar-ui]` — flujo de calibración.** Contrastar con el análisis: pasos exactos de su calibración
> multitáctil, número de toques, qué enseña mientras se toca, cómo confirma cada punto, cómo corrige y cómo verifica.
> Su calibración «por gesto en las cuatro esquinas» equivale aquí a `Physical marks` + `Quick`; si en la práctica es
> más rápida y suficiente, debe ser la sesión por defecto y `Standard` pasar a ser el refinamiento.

### 3.8 Zones & masks — dibujar, mover, ajustar

**Lienzo: espacio Wall** (o `Strip` para ver todas). Zonas en ámbar (contorno y relleno tenue; relleno más intenso
cuando están activas), máscaras con **rayado neutro** (ya no en rojo). Toques en vivo siempre visibles: una zona se
prueba pasando la mano.

**Barra de herramientas.** `Select` · `Zone` · `Mask` · `Define by touch` · `Snap` · `Duplicate` · `Copy to walls…` ·
`Align ▾`. Las herramientas de dibujo se sueltan solas tras crear un objeto.

**Asas.** Cuerpo y ocho asas (§3.3). Lectura flotante con posición y tamaño en metros y, entre paréntesis, en píxeles
del contenido. Doble toque en el nombre lo edita en el sitio. `Delete` o el icono de papelera borran con «Undo».

**`Define by touch`.** Pensado para la tablet dentro de la sala: el operador toca en la pared **dos esquinas opuestas**
del área que quiere (por ejemplo, las de un botón proyectado) y la zona aparece ahí. Evita traducir de cabeza entre la
pared y el dibujo.

**Fondo de contenido.** Con `Content underlay` (§3.5) el muro muestra el contenido real detrás de las zonas, de modo
que se dibujan encima de los elementos interactivos que ya existen en la pieza.

**Inspector de zona.** Nombre e identificador (con la dirección OSC resultante y un botón de copiar); **comportamiento**
—`Trigger` (entra/sale), `Hold` (mantener N ms), `Counter` (número de manos), `Toggle` (cada entrada alterna)—;
`Min hands`; `Release after`; un LED que parpadea al dispararse y un botón `Fire` para probar el receptor sin tocar
la pared.

**Máscaras sugeridas.** Tras capturar el fondo, si en una región aparece primer plano persistente (el marco de una
puerta, una lámpara), `Sensors` y `Zones` proponen una máscara punteada con `Accept` / `Dismiss`.

**Más adelante.** Zonas poligonales y circulares; zonas que abarcan dos muros contiguos.

### 3.9 Outputs — formatos, enrutado, monitor y prueba

**Idea.** Un destino es **un formato** que va a **un sitio**. La lista de destinos sigue en el panel; el lienzo pasa a
ser un **monitor de señal** que enseña exactamente lo que se está enviando al destino seleccionado.

#### Formatos

| Familia | Formato | Transporte | Contenido | Para |
|---|---|---|---|---|
| **Data** | `Touch data (OSC)` | UDP | El espacio de direcciones actual (`/vt/wall/<id>/touch`…) | TouchDesigner, Unreal, Max |
| | `TUIO 1.1` | UDP | `/tuio/2Dcur`, una fuente por muro | Apps TUIO |
| | `WebSocket (JSON)` | TCP, integrado | Tramas JSON (`/ws/data`) | Apps web y Electron |
| **Triggers** | `OSC triggers` | UDP | Reglas «cuando pase X → enviar esta dirección con estos valores» | Resolume, QLab, mesas de luces, Ableton |
| **Texture** | `Spout` | Textura compartida en la GPU, misma máquina | Imagen del lienzo de vídeo con los toques | TouchDesigner, Resolume, Unreal (con plugin) |
| | `NDI` | Red | La misma imagen | Otra máquina: TouchDesigner, Unreal, OBS |

**`OSC triggers`.** Es lo que el director llama «datos OSC para triggers». Hoy los eventos de zona ya salen por OSC,
pero con direcciones fijas (`/vt/zone/Z1/enter`). Un destino de disparadores es una tabla de reglas editable:

| When | Send | Arguments |
|---|---|---|
| `Zone "Door" enters` | `/composition/layers/1/clips/1/connect` | `1` |
| `Zone "Door" exits` | `/composition/layers/1/clips/1/connect` | `0` |
| `Zone "Pond" count changes` | `/pond/hands` | `{count}` |
| `Room burst ≥ 5` | `/cue/12/start` | — |
| `Wall P2 becomes active / idle` | `/p2/active` | `1` / `0` |

Con plantillas (`Resolume clip`, `QLab cue`, `On/Off per zone`, `Counter per zone`) que rellenan la tabla a partir de
las zonas existentes. Cada fila tiene su LED y su botón `Fire`.

**`Texture`.** Es la «textura blanco y negro». El motor dibuja una imagen del tamaño del lienzo de vídeo, con cada
toque en su posición ya mapeada, y la publica. En TouchDesigner entra por un `Syphon Spout In TOP` o un `NDI In TOP`
y se usa directamente como máscara, mapa de desplazamiento o emisor de partículas, sin procesar OSC.

| Ajuste | Opciones | Por defecto |
|---|---|---|
| `Content` | `Touch mask` (blanco duro sobre negro) · `Soft mask` (caída gaussiana, escala de grises) · `Trails` (los toques dejan estela que se apaga) · `Zones matte` (zonas activas en blanco) · `Debug` (vista en color con identificadores) · `Pattern` (dianas y rejilla, para calibrar sin ventana de proyección) | `Soft mask` |
| `Layout` | `Full canvas` (todos los muros en su región; coincide 1:1 con el contenido) · `One sender per wall` | `Full canvas` |
| `Resolution` | `1/1`, `1/2`, `1/4` del lienzo | `1/2` |
| `Frame rate` | 30 / 60 | 60 |
| `Blob size` | `Real size × gain` · `Fixed radius` | Real × 1.5 |
| `Feather`, `Decay`, `Invert`, `Alpha = luminance` | | |

Implementación propuesta: **reutilizar los addons nativos de VEATION** (`native/spout-send` y `native/ndi-send`), que
son código propio y ya resuelven lo difícil. Lo comprobado al revisarlos:

- `spout-send` usa SpoutDX, que crea su propio dispositivo Direct3D 11: funciona **sin ventana**, dentro del proceso del
  motor. Su interfaz es `start(name)`, `send(buffer, w, h, flipY)`, `stop()` con píxeles RGBA en CPU. La licencia de
  Spout es BSD de 2 cláusulas (compatible con la regla del proyecto).
- `ndi-send` carga el *runtime* de NDI de forma dinámica y degrada con elegancia si no está instalado
  (`available()`, `runtimeUrl()`): la interfaz debe mostrar «NDI runtime not installed — Get it». Hay que revisar los
  términos de NDI para un segundo producto (atribución de marca) y reflejarlo en el párrafo de licencias de `CLAUDE.md`.
- Los dos son N-API (binario estable entre Node y Electron), así que sirven tanto en `utilityProcess` como en el motor
  sin Electron.
- **Limitación:** ambos guardan **un solo emisor global** por proceso. `Full canvas` cabe tal cual; `One sender per
  wall` exige convertirlos a instancias (cambio pequeño).
- La imagen la genera el motor con un rasterizador propio en CPU (sellos gaussianos precalculados, borrado sólo de las
  regiones sucias). Con una docena de toques a 1920×1200 es trabajo de menos de un milisegundo; el coste real es subir
  la textura, que hay que medir. Por eso `1/2` por defecto.

Además, los mismos addons **reciben** Spout y NDI (`inList/inOpen/inFrame`, `findSources/recvOpen/recvRead`): es lo que
hace posible el `Content underlay` de §3.5 y §3.8 sin escribir código nativo nuevo.

#### Lienzo: monitor de señal

```
 FUENTES                      DESTINO SELECCIONADO                         RECEPTOR
 ● Touches   12/s  ───────▶  ┌────────────────────────────────────────┐
 ● Zones      2    ───────▶  │  lo que sale por este destino, en vivo │ ──▶ 127.0.0.1:9000
 ● Room       —              │  (mensajes · cursores · textura)       │     ● sending 60 Hz
 ● Texture   60 fps          └────────────────────────────────────────┘
```

Según el formato del destino seleccionado, el centro muestra:

- **Data (OSC/TUIO):** un registro de mensajes en vivo (dirección, argumentos, frecuencia), con filtro por dirección,
  pausa y «copiar dirección». Es lo que hoy obliga a abrir un monitor OSC externo.
- **Triggers:** la tabla de reglas con sus LED y una línea de tiempo de los últimos disparos.
- **Texture:** la imagen exacta que se emite, sobre el contorno del lienzo de vídeo y las regiones de los muros.
- **WebSocket:** la última trama JSON formateada y la lista de clientes conectados.

#### Añadir un destino

`+ Add destination` abre un selector por **uso**, no por protocolo: `TouchDesigner — data (OSC)`, `TouchDesigner —
texture (Spout)`, `Unreal — data (OSC)`, `Unreal — texture (NDI)`, `Resolume / QLab — triggers`, `TUIO app`, `Web app`,
`Custom…`. Cada opción crea el destino con sus valores habituales y enseña, plegada, una nota de dos líneas sobre cómo
recibirlo (el operador, el nodo o el plugin que hace falta) con un enlace para descargar un ejemplo.

#### Inspector del destino

Nombre, formato, host y puerto (o nombre del emisor Spout/NDI), muros incluidos, **coordenadas** (`Per wall 0–1`,
`Canvas 0–1`, y nuevas: `Canvas pixels`, `Wall metres`), frecuencia, prefijo. Estado: enviados/s, errores, último
error.

#### Pruebas que prueban algo

| Botón | Qué hace |
|---|---|
| `Test touch` | Envía durante 5 s un toque sintético que recorre un círculo en el muro elegido, **marcado en el lienzo como «test»**. El receptor ve datos reales con forma reconocible |
| `Fire` | Dispara una regla o una zona |
| `Test pattern` | En textura: barra que barre el lienzo e identificador de cada muro |
| `Mute all outputs` | Corta todo envío (también disponible en `Live`) |

UDP no confirma la recepción. Para saber si el receptor escucha, el ejemplo de TouchDesigner y el SDK responden con
`/vt/pong`; cuando llega, el destino muestra `Receiver confirmed`. Sin esa respuesta, el estado dice `Sending (no
confirmation)`, que es la verdad.

> **`[REF lidar-ui]` — salidas.** Contrastar con el análisis: qué formatos ofrece (WebSocket, UDP, OSC, TUIO, Spout),
> cómo se eligen, qué enseña de lo que envía y cómo es su receptor de TouchDesigner. El formato de su textura Spout y
> la estructura de su receptor deben orientar los valores por defecto de `Texture` y el ejemplo descargable.

### 3.10 Live / Show — panel de operación

**Lienzo: espacio Strip** (o `Plan`), con los toques en vivo y cada muro coloreado sólo por estado: normal, o rayado en
rojo si su sensor está caído.

**Encima del lienzo, una franja de salud** que se lee en un segundo:

```
 ● ALL SYSTEMS RUNNING        Sensors 4/4     Touches 7     Outputs 2 · 118 msg/s     Up 6 h 12 min
```

Si algo falla, la franja cambia a una **incidencia** con su acción: `S3 offline since 21:14 · retrying (attempt 4) ·
[Restart now] [How to fix]`. Las incidencias pasadas quedan en una lista plegable («21:14–21:15 S3 offline, recovered»).

**Inspector.** Tarjetas por muro (LED del sensor, toques, frecuencia), actividad de zonas, actividad de salidas con
mini-gráfica, y una gráfica de los últimos 10 min de toques en sala.

**Controles de emergencia** (siempre a la vista, grandes): `Mute outputs`, `Re-capture background…` (guiado: «sala
vacía, 3-2-1»), `Restart sensor ▾`, `Verify`.

**`Show lock`.** Un candado en la barra superior bloquea toda edición y atenúa la interfaz. La tablet de sala arranca
bloqueada; desbloquear pide mantener pulsado 1 s. Cambiar de sala con el candado quitado pide confirmación con el
efecto exacto: «This stops 4 sensors and 2 outputs».

**Simulador.** `Virtual hands` pasa a ser una herramienta de la barra del lienzo (se ve que está activa) y sólo aparece
si hay sensores simulados.

### 3.11 System — lo que queda

Un panel de ajustes, no un espacio de trabajo: `Rooms` (lista, importar, exportar, duplicar, **versiones** del perfil
para restaurar), `Devices` (emparejamiento, §5), `Projection` (pantalla, ventana), `Processing` (los 16 parámetros,
agrupados, cada uno con su valor por defecto visible y `Reset`; los tres que más se tocan —margen de fondo, tamaño
mínimo y máximo— con una vista previa en vivo en `Sensors`), `Application`, `Log`.

### 3.12 Pila técnica recomendada

**Mantener JS sin compilación y Canvas2D.** La escena es pequeña (unos miles de puntos a 10 Hz y unas decenas de
formas); Canvas2D sobra. WebGL sólo se justificaría con nubes de más de ~50 000 puntos o mapas de calor densos, y un
*framework* no arregla nada de lo diagnosticado. Lo que hace falta es **estructura**, y se puede añadir sin
dependencias:

| Pieza nueva | Qué hace | Tamaño aproximado |
|---|---|---|
| `Workspace` (interfaz) | Cada herramienta es un módulo: `enter/exit`, `draw(ctx, view)`, gestor de puntero, definición de barra e inspector | reorganiza `views.js` + `roomview.js` |
| `Viewport` | Transformaciones de los cuatro espacios, encuadre animado, zoom alrededor del puntero | ~200 líneas |
| `Gizmos` | Asas, anillo de giro, esquinas, rejilla, guías, lupa; pruebas de impacto con margen táctil | ~500 líneas |
| Máquina de estados de puntero | `idle → pressed → dragging/drawing/panning/pinching`, una por lienzo | ~150 líneas |
| Panel con actualización por claves | Se actualizan los valores que cambian; no se reconstruye el DOM con cada evento (resuelve T5) | ~200 líneas |
| Rasterizador de textura (motor) | Sellos en un `Uint8Array` | ~200 líneas |

Si el panel sigue creciendo, la opción razonable es una plantilla ligera con claves (del tipo `lit-html`, licencia BSD,
importable como módulo sin compilación), con un coste de migración de 2–3 días. No se recomienda ahora.

---

## 4. Flujos de principio a fin

### 4.1 Sala nueva desde cero (asistente `New room`)

Se abre solo cuando no hay sala, y desde `Room ▾ → New room…`. Siete pantallas, una decisión por pantalla, con `Back`
siempre y `Skip for now` donde tiene sentido. Al terminar se queda en `SETUP` con los pasos marcados.

1. **Name & template.** Nombre y plantilla (`Single wall`, `Corner`, `Corridor`, `U`, `Box`, `Custom`, `From a plan…`).
2. **Dimensions.** Ancho, fondo, alto de la superficie táctil. Vista previa en planta que se actualiza al teclear.
   Los muros se pueden renombrar aquí.
3. **Video output.** Tamaño del lienzo de vídeo (con los habituales: 1920×1080, 3840×2160, 3840×2400) y reparto
   (`1×N`, `2×2`, `N×1`, `Custom`). Vista previa en el espacio `Output`, con regiones arrastrables.
4. **Sensors.** `Scan network`, `Add by IP`, `Use simulated sensors` (para preparar la sala sin hardware). Un sensor
   por muro por defecto; se pueden añadir más.
5. **Projection.** Elegir la pantalla de salida y abrir la ventana con el patrón `Identify`. Pregunta única: «Do you
   see each wall's name on the right wall?» → `Yes` / `No, fix mapping` (lleva a `Mapping`).
6. **Outputs.** Elegir uno o varios destinos por uso (§3.9).
7. **Next steps.** Resumen con lo que queda: `Place sensors`, `Capture background`, `Calibrate P1…P4`, cada uno como
   botón que lleva al sitio.

### 4.2 Puesta en marcha de un sensor (descubrir → IP → asignar → nivelar → fondo)

Los S2E salen de fábrica todos con la misma dirección (192.168.11.2) y nunca hablan primero. El flujo lo asume.

1. **Comprobación de red del PC.** Al abrir `Scan network`, la app comprueba que este equipo tiene una dirección en
   `192.168.11.0/24`. Si no, se detiene ahí: «This computer has no address on the sensor network (192.168.11.x).» con
   la interfaz sugerida y el comando para añadirla (copiable; `Apply` lo ejecuta con elevación en la app instalada).
2. **Un sensor nuevo cada vez.** Instrucción explícita: «Connect ONE new sensor». `Scan` sondea la dirección de
   fábrica, las direcciones del perfil y el resto de la subred, y lista los que responden con modelo, serie y firmware.
3. **Dirección.** Para el sensor en la dirección de fábrica propone la siguiente libre (`.11`, `.12`…). `Assign` usa
   `setStaticIp`, que está **sin probar**; mientras no se valide, la pantalla ofrece la vía segura: «Change it with
   Slamtec RoboStudio, then press Re-scan», con los pasos. **[validar con hardware]**
4. **Etiquetar.** La app sugiere pegar una etiqueta física con el identificador (`S2 · .12`). Parece trivial y ahorra
   horas en el siguiente montaje.
5. **Asignar a un muro.** Arrastrar la tarjeta del sensor a un muro, o `Identify`: agitar la mano delante del sensor y
   ver cuál se enciende.
6. **Colocar.** En `Sensors`, arrastrar el glifo a su posición aproximada y girarlo, o `Auto-align`.
7. **Nivelar.** `Level check` hasta que no haya roce con la pared y la línea de suelo esté completa.
8. **Fondo.** `Capture background` con cuenta atrás de 5 s («Leave the wall clear»), barra de progreso y resultado
   visible: la nube pasa de blanco a gris. Si durante la captura hubo movimiento, lo dice y propone repetir.
9. **Comprobar.** Poner la mano en la pared: aparece un círculo cian. El paso `Sensors` del rail queda en verde.

### 4.3 Mapear un muro

1. **Reparto.** En `Mapping`, elegir `Layout` o arrastrar la región del muro en la vista `Output`. Para muchas salas
   esto es todo.
2. **Comprobar en la pared.** `Show on wall` proyecta la rejilla de 0,5 m con el nombre del muro. Si la rejilla llega a
   los bordes y sus cuadros miden 50 cm, el mapeo `Rect` es correcto: fin.
3. **Esquinas.** Si no, pasar a `Corners`. Desde la tablet, elegir cada esquina y moverla con el panel táctil hasta que
   la marca cae en la esquina física de la superficie táctil.
4. **Rejilla.** Si los bordes están bien pero el centro no (lente, panza, solape), pasar a `Grid`, `Add row/column`
   donde se vea el error y ajustar esos puntos: con el mando si hay una referencia visible, o con `Touch to pin` si
   están al alcance.
5. **Guardar.** No hay botón: cada punto se guarda al soltarlo, con «Undo».

### 4.4 Calibrar un muro desde la tablet

1. En la tablet, `Calibrate`; tocar el muro en el navegador. La pantalla previa muestra los requisitos y su estado.
2. Elegir `Standard`. Pulsar `Start` (64 px, abajo a la derecha). La tablet pasa a pantalla completa y pide mantener
   la pantalla encendida.
3. Caminar hasta la primera diana (ámbar, respirando). Apoyar la mano abierta. El anillo se llena en 0,7 s; destello,
   sonido, vibración; `Release`.
4. Seguir la flecha hasta la siguiente. Si algo no captura, la pared dice por qué.
5. Si un toque salió mal, `Undo last` con el pulgar y repetir.
6. `Top corners`: mover con el mando las dos esquinas de arriba hasta la esquina física.
7. Resultado: mapa de error. Si un punto destaca, `Redo worst point`. `Apply`.
8. `Verify`: recorrer el muro con la mano mirando el anillo cian. `Fix here` donde no coincida. `Done`.
9. El navegador marca el muro (`P2 · 6 mm`) y propone el siguiente.

Tiempo objetivo por muro: menos de 3 min en `Standard`, menos de 1 min en `Quick`. **[validar con hardware]**

### 4.5 Crear zonas

1. `Zones`, elegir el muro. Activar `Content underlay` si hay contenido que seguir.
2. `Zone`, arrastrar un rectángulo (o `Define by touch` y tocar dos esquinas en la pared).
3. Ajustar con las asas; la lectura flotante da medidas. Nombrarla en el sitio.
4. Elegir el comportamiento en el inspector. Pasar la mano o pulsar `Fire`: el LED parpadea.
5. `Duplicate` o `Copy to walls…` para repetirla.

### 4.6 Probar las salidas con TouchDesigner o Unreal

1. `Outputs → + Add destination → TouchDesigner — data (OSC)`. Se crea con `127.0.0.1:9000`.
2. Descargar el ejemplo desde la nota del destino y abrirlo en TouchDesigner.
3. `Test touch`: en el monitor de señal se ven los mensajes; en TouchDesigner, un punto que gira. Si el ejemplo
   responde, el destino pasa a `Receiver confirmed`.
4. Para textura: `+ Add destination → TouchDesigner — texture (Spout)`; en TouchDesigner, un `Syphon Spout In TOP` con
   el nombre del emisor. `Test pattern` barre el lienzo; después, tocar la pared y ver las manchas blancas.
5. Para Unreal: OSC con el plugin OSC (servidor en el puerto indicado); textura por NDI con el plugin de NDI. La nota
   del destino lo resume.
6. Si no llega nada: el monitor distingue «no se envía» (destino desactivado, muros excluidos, sin toques) de «se
   envía y no hay confirmación» (puerto, cortafuegos del receptor, dirección).

### 4.7 Operación diaria y recuperación

**Arranque.** El PC enciende, la app arranca con Windows y abre en `SHOW` con la última sala. La franja de salud debe
quedar en verde en menos de 15 s (los sensores tardan en girar). La tablet de sala abre su acceso directo y entra
bloqueada.

**Comprobación antes de abrir (1 min).** `Verify` en un muro: tocar tres sitios. Si el anillo coincide, listo.

**Recuperaciones previstas:**

| Síntoma | Qué muestra la app | Qué hace el operador |
|---|---|---|
| Un sensor se cae | Incidencia roja; el muro se raya; reintentos visibles | Esperar al reintento o `Restart now`; si persiste, `How to fix` (cable, alimentación, ping) |
| Toques fantasma | Los círculos aparecen sin manos | `Mute outputs` (corta el efecto en la pieza), sala vacía, `Re-capture background`, quitar `Mute` |
| Los toques no coinciden | — | `Verify`; si es un solo muro, `Quick` (pose); si son todos, comprobar el proyector y `Mapping` |
| El receptor no reacciona | Salida en `Sending (no confirmation)` o con errores | `Test touch`; revisar puerto y host |
| El motor se reinicia | Cortina «Engine restarting… back in 2 s» con cuenta atrás | Nada: vuelve solo |
| La tablet pierde la red | «Can't reach the server at 172.16.2.42» con `Retry` y `Pair again` | Comprobar la Wi‑Fi de la tablet |
| Alguien cambió algo | — | `System → Rooms → Versions`, restaurar la de ayer |

---

## 5. Emparejamiento de dispositivos

### 5.1 Qué pasó y qué hay que diseñar

El diagnóstico en esta máquina confirma **dos causas reales a la vez**: había dos interfaces activas (Ethernet
172.17.1.51 y Wi‑Fi 172.16.2.42, ambas en perfil «Público» de Windows), el QR codificaba la primera (Ethernet), y no
existía ninguna regla de entrada para la aplicación. El arreglo de hoy (Wi‑Fi primero, texto de ayuda, regla en el
instalador) quita las causas conocidas, pero la app sigue **sin saber** si el emparejamiento es posible. El diseño debe
cumplir tres cosas: elegir bien, comprobar lo comprobable y confirmar lo que sólo se puede saber cuando la tablet
llega.

### 5.2 El panel `Connect a device`

Se abre desde la barra superior (el botón muestra cuántos dispositivos hay conectados: `▣ 2`). Tiene cuatro bloques,
de arriba abajo:

**1 · Red.** Una tarjeta por interfaz, no un control segmentado (no caben y hay que decir más cosas):

```
 ◉ Wi-Fi            172.16.2.42     Public     ✓ recommended — a tablet connected here yesterday
 ○ Ethernet         172.17.1.51     Public
 ⊘ Ethernet 2       192.168.11.100  —          Sensor network — tablets can't join this one
```

Criterio de recomendación, por orden: la interfaz por la que ya entró una tablet; el punto de acceso propio del PC si
está activo; Wi‑Fi; Ethernet. La red de los sensores se muestra **deshabilitada y explicada**, no oculta. Si la primera
no funciona, un botón `Didn't work — try next network` pasa a la siguiente y regenera el QR.

**2 · Comprobaciones automáticas.** Se ejecutan al abrir el panel y al cambiar de red:

| Comprobación | Cómo | Si falla |
|---|---|---|
| `Server listening on :8770` | El motor lo sabe | «Port 8770 is taken — using 8771» (ya cambia de puerto; ahora lo dice) |
| `Windows Firewall allows incoming connections` | El proceso principal consulta las reglas que afectan al ejecutable y al puerto, incluidas las de **bloqueo** | `Fix` (añade la regla con elevación) y, debajo, el comando para hacerlo a mano |
| `Network type` | Perfil de Windows de esa interfaz | Informativo: la regla se crea para todos los perfiles |
| `Other devices visible on this network` | Vecinos en la tabla ARP de esa interfaz | «No other devices seen on this Wi-Fi. It may isolate clients — use the room access point or this PC's hotspot.» (indicio, no certeza) |

Dos detalles que explican fallos reales: cuando Windows muestra su aviso de seguridad y el usuario lo cierra, suele
quedar una regla de **bloqueo** para ese programa, que hay que detectar y quitar; y en desarrollo el ejecutable es
`electron.exe`, al que la regla del instalador no cubre, así que la comprobación debe mirar también el puerto.

**3 · El código.** El QR, la dirección en texto grande y un **código de 6 dígitos**:

```
        ┌────────────┐      Scan with the tablet camera
        │    QR      │      or open   172.16.2.42:8770
        └────────────┘      and enter  4 8 2 · 9 1 5      (changes every 5 min)
```

El código cubre los casos en que la cámara no lee, la tablet es un portátil, o el acceso directo de la pantalla de
inicio no conserva la clave (§5.4).

**4 · Confirmación en vivo.** Lo único que demuestra que el camino funciona es que la tablet llegue. En cuanto el
servidor recibe **cualquier** petición desde una dirección que no es local, el panel lo anuncia:

```
 ✓ A device reached this computer (172.16.2.87 · iPad · Safari) — pairing…
 ✓ Paired: "iPad"   [Rename] [Remove]
```

Si a los 20 s de mostrar el QR no ha llegado nada, se despliega la guía, **ordenada por lo que las comprobaciones ya
saben** (no una lista fija):

1. «Is the tablet on the Wi‑Fi named **…**? Its address should start with `172.16.2.`» (el prefijo esperado, a la vista).
2. Cortafuegos: estado real y botón `Fix`.
3. Aislamiento de clientes: qué es y las dos salidas (punto de acceso de la sala, punto de acceso del PC).
4. `Try next network`.

### 5.3 En la tablet

| Situación | Qué ve hoy | Qué debe ver |
|---|---|---|
| Página cargada, sin clave o con clave antigua | «Connection to the engine lost — Reconnecting…» sin fin | Pantalla `Pair this device`: seis casillas grandes para el código y «Ask the operator at the server for the code» |
| Emparejada, el motor se reinicia | La misma cortina | «Engine restarting…» con cuenta atrás; reconecta solo |
| Emparejada, sin red | La misma cortina | «Can't reach the server at 172.16.2.42» · `Retry` · `Pair again` |
| Clave revocada desde el servidor | La misma cortina | «This device was removed» · `Pair again` |

Tras emparejar, una pantalla única de bienvenida: nombre del dispositivo, `Add to Home Screen` (con las dos líneas de
instrucciones del sistema que corresponda) y `Start`.

### 5.4 Robustez de red: el punto de acceso propio

En salas ajenas la Wi‑Fi es la mayor fuente de problemas (aislamiento de clientes, portales cautivos, redes de
invitados). La opción más sólida es no depender de ella: **Windows puede crear su propio punto de acceso** («Mobile
hotspot»). La tablet se une a esa red y el servidor está siempre en la misma dirección. Propuesta: un modo `Room
hotspot` en el panel que muestra **dos QR en orden** —1 «Join the Wi‑Fi» (QR de red), 2 «Open VEATION Touch»— y que
recomienda esa interfaz en cuanto existe. Activarlo desde la app es posible pero requiere trabajo; en una primera fase
basta con detectarlo y documentar cómo encenderlo. Para salas fijas, la recomendación de la investigación sigue en pie:
punto de acceso dedicado cableado al mismo conmutador, sin aislamiento, con dirección reservada para el servidor.

Más adelante: nombre local (`veation-touch.local`) para no depender de la dirección; lista de dispositivos con
`Remove`; un solo dispositivo con control durante la calibración y el resto en lectura.

### 5.5 Instalación como app (PWA) y sus límites

Conviene decirlo sin rodeos: **por HTTP en una dirección de la red local no hay PWA instalable** en Chrome/Android
(exige HTTPS o `localhost`), y varias funciones útiles exigen contexto seguro.

| Función | Por HTTP en la LAN | Alternativa |
|---|---|---|
| Acceso directo en la pantalla de inicio | Sí en iPadOS (se abre sin barras con las metaetiquetas adecuadas); en Android es un marcador que abre el navegador | Añadir `manifest`, iconos y metaetiquetas de Apple |
| Mantener la pantalla encendida (`Wake Lock`) | **No** (exige contexto seguro) | Vídeo mudo en bucle de 1 px mientras dura la calibración (técnica conocida; funciona por HTTP) |
| Vibración | Sólo Android | Sonido y destello de pantalla |
| Pantalla completa | Android sí; iPadOS parcial; iPhone no | Diseñar el modo foco para que funcione con la barra del navegador visible |
| Funcionamiento sin conexión | No aplica: sin servidor no hay nada que hacer | — |

**Aviso específico de iPadOS:** una web añadida a la pantalla de inicio tiene **almacenamiento separado** del de
Safari. Hoy la clave llega en la URL, se guarda en `localStorage` y se borra de la barra de direcciones; el acceso
directo se crea sin clave y arranca sin emparejar. Con la pantalla `Pair this device` y el código de 6 dígitos el
problema desaparece: el acceso directo se empareja una vez y lo recuerda.

**HTTPS, si algún día compensa.** Tres caminos y su coste: certificado autofirmado (aviso de seguridad en cada tablet;
descartado), **autoridad local instalada en las tablets del estudio** (perfil que se instala una vez; da PWA completa y
`Wake Lock`; razonable sólo para tablets propias), o dominio público con certificado real que resuelve a direcciones
locales (depende de internet y de custodiar una clave; excesivo para este producto). Recomendación: **fase 1 por
HTTP** con acceso directo y las alternativas de la tabla; valorar la autoridad local si el estudio fija un parque de
tablets. Para tablets dedicadas a una sala, un navegador en modo quiosco (o Acceso Guiado en iPad) resuelve además el
bloqueo de pantalla y las salidas accidentales.

---

## 6. Tablet, teléfono y ergonomía táctil

### 6.1 Disposición por contexto, no sólo por ancho

La disposición se decide con **tipo de puntero + tamaño + orientación**:

| Contexto | Disposición | Notas |
|---|---|---|
| **Escritorio** (puntero fino, ≥1100 px) | Rail 64 · lienzo · inspector 340 fijo | Densidad VEATION (11 px, controles de 22 px) |
| **Tablet apaisada** (puntero grueso, ≥900 px de ancho) | Rail 76 · lienzo a todo el ancho · inspector como **cajón derecho** de 360 px que se abre al seleccionar y se pliega con un gesto | Hoy recibe la disposición de escritorio con panel fijo de 400 px |
| **Tablet vertical** (600–900 px) | Lienzo arriba · **hoja inferior** con tres alturas · pestañas abajo | El lienzo ocupa todo salvo la hoja asomada (72 px): pasa del 42 % actual a ≈85 % |
| **Teléfono** (<600 px) | Una columna; lienzo de un solo muro; hoja inferior | Mando y monitor, no editor |

**Qué hace cada dispositivo.** No todo tiene que caber en todas partes; decirlo evita diseñar a medias:

| Tarea | Escritorio | Tablet | Teléfono |
|---|---|---|---|
| `Live`, salud, emergencias | ● | ● | ● |
| `Calibrate`, `Verify` | ○ (sólo ver) | ● **principal** | ● |
| Mando de `Mapping` en la pared | ○ | ● **principal** | ● |
| `Zones` (dibujar, `Define by touch`) | ● | ● | ○ (activar, probar) |
| `Sensors` (colocar, nivelar, fondo) | ● | ● | ○ (salud, reiniciar, fondo) |
| `Room`, `Mapping` (vista `Output`), `Outputs` | ● **principal** | ● | ○ (sólo ver; «Best edited on a tablet or desktop») |

### 6.2 Uso con una mano

El operador sujeta la tablet con una mano (normalmente la izquierda, agarrando el borde) y toca la pared con la otra.
Lo que se deduce:

- Las acciones de la tarea en curso van **abajo**, al alcance del pulgar de la mano que sujeta, en una fila de botones
  de 64 px. Nunca arriba.
- Lo destructivo (`Cancel`, `Discard`, `Delete`) va **lejos** de esa fila: en un menú o en la esquina opuesta.
- Ajuste `Handedness: left / right` que refleja la fila y el lado del cajón.
- Durante `Calibrate` y el mando de `Mapping`, **toda** la interacción necesaria cabe en esa fila; el resto de la
  pantalla informa, no pide.
- La hoja inferior se arrastra desde un asidero de 48 px de alto, no desde una línea de 4 px.

### 6.3 Tamaños táctiles

| Elemento | Hoy (puntero grueso) | Propuesta | Motivo |
|---|---|---|---|
| Altura de control (`--ctl-h`) | 38 px | **44 px** | Mínimo de WCAG 2.5.5 y de las guías de Apple; 48 en Material |
| Botón pequeño (`.btn.small`) | 34 px | 44 px de zona táctil (el dibujo puede seguir siendo menor) | Ídem |
| Acciones de la tarea en curso | 38 px | **64 px** | Se pulsan sin mirar, con el pulgar, a oscuras |
| Interruptor | 42×24 | 52×32 | Ídem |
| Asas del lienzo | — | 10–12 px visibles, **44 px** de zona táctil, con lupa | El dedo mide ≈10 mm y tapa el asa |
| Separación entre objetivos | 8 px | ≥8 px, y ≥24 px entre una acción destructiva y cualquier otra | Errores por vecindad |
| Texto base | 13 px | **14 px**; etiquetas del lienzo ≥12 px | Se lee a un brazo de distancia |

### 6.4 Sala oscura

- La interfaz ya es oscura (L* 5–15), lo cual es correcto. El riesgo está en las **superficies claras grandes**: el
  botón primario relleno de `--ink` a todo el ancho y el QR sobre blanco son, a oscuras, una linterna que deslumbra al
  operador y se refleja en la pared.
- **Modo `Dim`** (interruptor en la barra superior de la tablet; se activa solo al entrar en `Calibrate`): baja las
  tintas un escalón (`--ink` → `#B8B8B8`, `--ink-2` → `#8C8C8C`), convierte el botón primario en contorno y limita el
  área clara de cualquier pantalla. No añade colores.
- La proyección también deslumbra: opción `Dim targets` para dibujar dianas y patrones al 60 %.
- Nada de información sólo por color: cada estado lleva forma o texto (anillo lleno, marca, etiqueta).

### 6.5 Sonido y vibración

- **Tres señales**, cortas y distinguibles sin mirar: *captura* (tono ascendente, 80 ms), *problema* (dos tonos graves),
  *fin* (acorde). Se generan en el navegador; el toque en `Start` desbloquea el audio.
- **Vibración** donde exista (Android); en iPad no hay, así que el sonido y el destello de pantalla son el canal
  principal y la vibración un extra.
- Opción `Room sound cues`: las mismas señales por la salida de audio del servidor, para cuando la tablet está en
  silencio o en el bolsillo. Desactivada por defecto (puede haber público).
- La señal más fiable sigue siendo **la pared**: el destello de la diana.

---

## 7. Diseño visual

### 7.1 Sistema y retícula

Se mantienen los tokens de VEATION: tres superficies (`--s0/--s1/--s2`), rampa de tinta, tres alfas de línea, paleta
cerrada de espaciado (2–32 px), radio de 3 px, Geist. Retícula de 4 px.

| Zona | Escritorio | Táctil |
|---|---|---|
| Barra superior | 36 px | 52 px |
| Rail | 64 px (icono + etiqueta + indicador) | 76 px; pestañas inferiores de 56 px en vertical |
| Barra de herramientas del lienzo | 32 px, flotante, `--s1` con borde `--line` | 52 px |
| Navegador de muros | 64 px | 88 px |
| Inspector | 340 px | cajón de 360 px / hoja inferior |
| Barra de estado | 22 px | oculta (su contenido pasa a la hoja asomada) |

### 7.2 Color: quién usa qué

El presupuesto de dos acentos se mantiene **sin excepciones**. Lo que cambia es que se asigna cada uso:

| Color | Significa | Se usa en |
|---|---|---|
| **Cian** `--live` | Dato vivo | Toques, anillo de `Verify`, LED de salida enviando, contadores en vivo |
| **Ámbar** `--attn` | Mira aquí / hay que hacer algo | Zonas, diana activa, punto de mapeo seleccionado, avisos, requisitos pendientes |
| **Tinta** `--ink` / `--line-strong` | Selección y herramienta | Contorno de selección, asas, guías de ajuste, lectura flotante |
| **Verde** `--ok-ink` | Estado correcto (no es acento) | LED de sensor, marca de «hecho» |
| **Rojo** `--danger` | Avería (no es acento) | Sensor caído, salida con error, roce del plano con la pared, objeto rechazado |
| **Rayado neutro** | Excluido | Máscaras (hoy en rojo), muro desactivado |

### 7.3 Cambios de token que se proponen (y por qué)

| Token | Cambio | Motivo |
|---|---|---|
| `--ctl-h` (táctil) | 38 → 44 px | §6.3 |
| `--fs` (táctil) | 13 → 14 px | Lectura a un brazo |
| `--hit` (nuevo) | 48 px | Zona táctil mínima, separada del tamaño dibujado |
| `--action-h` (nuevo) | 64 px | Fila de acciones de la tarea en curso |
| Uso de `--ink-3` | Prohibido para ayudas y subtítulos; pasan a `--ink-2` | La regla ya existe en VEATION (Lc −38, «no es texto de cuerpo») y hoy se incumple en `#stageHint`, `.item small`, `.field > span` |
| Máscaras | `--danger` → rayado en `--ink-dim` | El rojo queda para averías |
| Modo `Dim` (nuevo, por atributo) | Rampa de tinta un escalón más baja | §6.4. No añade colores |

No se propone un tercer acento.

### 7.4 Componentes

| Componente | Descripción | Estados |
|---|---|---|
| **Rail de pasos** | Icono, etiqueta, indicador (marca verde · punto ámbar con número · vacío) | reposo, activo, con aviso, deshabilitado |
| **Barra de herramientas** | Segmentos de herramienta + conmutadores + acciones | herramienta activa (`--state-on`), deshabilitada con motivo en la ayuda |
| **Navegador de muros** | Miniatura con toques vivos e insignia del paso | activo, con avería (rayado), desactivado |
| **Inspector** | Secciones plegables; cabecera con el objeto y su tipo | vacío (resumen + siguiente paso), selección múltiple |
| **Hoja inferior / cajón** | Tres alturas; asidero de 48 px | asomada, media, completa |
| **Asas y guías** | §3.3 | reposo, sobre el asa, arrastrando, ajustado (guía visible) |
| **Bloque de salud** | Cuatro lecturas grandes + mini-gráfica | correcto, degradado, caído |
| **Franja de incidencia** | Texto, tiempo, acción principal, `How to fix` | activa, resuelta (se pliega a la lista) |
| **Lista de requisitos** | Marca, texto, acción | hecho, pendiente (con motivo), en curso |
| **Aviso con `Undo`** | Sustituye a las confirmaciones de borrado | 8 s; se apila |
| **Tarjeta de red** | Nombre, dirección, tipo, recomendación | elegida, disponible, no apta (con motivo) |
| **Entrada de código** | Seis casillas de 56 px | vacía, incorrecta, caducada |
| **Monitor de señal** | Registro, tabla de reglas o vista previa de textura | en vivo, en pausa, sin señal |
| **Mando de mapeo** | Miniatura + panel táctil + flechas | punto elegido, moviendo, fijado por toque |

### 7.5 Estados

| Estado | Tratamiento |
|---|---|
| **Vacío** | Nunca un panel en blanco. `Room` sin muros: «Create your room» con las plantillas. `Zones` sin zonas: «Draw a zone or define it by touch», con los dos botones. `Outputs` sin destinos: el selector por uso |
| **Cargando** | «Connecting to the engine…» sólo en el primer arranque; después, esqueleto del lienzo con el último estado conocido atenuado |
| **Sin conexión** | Tres mensajes distintos (§5.3): motor reiniciando · servidor inalcanzable · dispositivo sin emparejar |
| **Sensor caído** | Muro rayado en rojo, LED rojo, franja de incidencia con reintento visible y acción |
| **Sensor conectando** | LED ámbar pulsante con el tiempo de espera |
| **Sin fondo / fondo antiguo** | Insignia ámbar en el sensor y requisito pendiente; «captured 9 days ago» en ámbar si supera un umbral |
| **Sin calibrar / calibración antigua** | Insignia en el navegador; en `Live`, aviso discreto, no bloqueo |
| **Sólo lectura** | Candado en la barra, asas ocultas, interfaz atenuada; motivo visible (`Show lock` o «Calibration in progress on Tablet 1») |
| **Cambio rechazado** | El objeto vuelve a su sitio con animación y aviso «Changed on another device — reloaded» |
| **Error de salida** | LED rojo en el destino con el último error en una línea |

### 7.6 Iconografía

Se mantiene el estilo actual: trazo de 1,5 px, sin relleno, extremos redondeados, caja de 20 px (24 en táctil).
Iconos nuevos: `Mapping` (cuadrilátero con cuatro puntos), `Plan`, `Wall`, `Output`, `Corners`, `Grid`, `Add row`,
`Add column`, anillo de giro, `Flip`, `Snap`, `Undo/Redo`, `Lock`, `Mute`, `Texture`, `Trigger`, `Verify`, `Dim`.
Toda herramienta lleva icono **y** etiqueta en el rail; en la barra del lienzo, icono con etiqueta visible en tablet y
con ayuda emergente en escritorio.

### 7.7 Movimiento

| Uso | Duración | Curva |
|---|---|---|
| Cambios de estado de controles | 120 ms (actual) | lineal |
| Hoja inferior, cajón | 200 ms | salida suave |
| Encuadre de un muro (la cámara viaja) | 250 ms | entrada-salida |
| Destello de captura | 300 ms | salida |
| Diana activa «respirando» | continuo, 1,5 s | seno (ya existe en la proyección) |
| Objeto que vuelve tras un rechazo | 180 ms | salida |

Nada más se mueve de forma continua salvo los datos en vivo. Se respeta `prefers-reduced-motion` (el encuadre salta,
el destello se queda en cambio de color).

---

## 8. Wireframes

Esquemas de estructura, no de estilo. `[ ]` = botón, `( )` = asa, `●` = estado.

### 8.1 Escritorio — marco general, en `Zones`

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉ VEATION Touch │ Room: Barcelona XR Lab ▾ │ [SETUP] SHOW │ ● 4/4  ● 3  ▣ 1 │ Projection ▾       │
├─────────┬──────────────────────────────────────────────────────────────┬─────────────────────────┤
│ Live    │ [Select][Zone][Mask][By touch] │ Snap │ Dup │ ⟲ ⟳ │ Fit + −  │ ZONE · Z1               │
│─────────│                                                              │ Name    [P2 centre    ] │
│ 1 Room ✓│     P2 · Pantalla 2                          7.35 × 3.50 m   │ Address /vt/zone/Z1  ⧉  │
│ 2 Map  ✓│   ┌──────────────────────────────────────────────────────┐   │ Wall    [P2 ▾]          │
│ 3 Sens ✓│   │                 S2 ◎                                 │   │─────────────────────────│
│ 4 Cal  !│   │                                                      │   │ BEHAVIOUR               │
│ 5 Zones │   │        ( )───────( )───────( )                       │   │ [Trigger][Hold][Count]  │
│   · 1   │   │         │  P2 centre       │        ◉ 12             │   │ Hold after   [1000] ms  │
│ 6 Out  ✓│   │        ( )   x 2.60 y 1.10 ( )                       │   │ Release      [ 150] ms  │
│         │   │         │    0.80 × 0.60 m │                         │   │ Min hands    [   1]     │
│         │   │        ( )───────( )───────( )                       │   │─────────────────────────│
│         │   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ guía de centro ─ ─ │   │ POSITION (m)            │
│         │   └──────────────────────────────────────────────────────┘   │ X [2.60] Y [1.10]       │
│         │   ════════════════════ suelo ═════════════════════════════   │ W [0.80] H [0.60]       │
│─────────│ ┌─────┐┌──────┐┌──────┐┌──────┐┌──────┐                      │─────────────────────────│
│ ⚙ System│ │ All ││P1 ·0 ││P2 ·1 ││P3 ·0 ││P4 ·0 │   navegador de muros │ ● idle   [Fire] [Delete]│
├─────────┴─┴─────┴┴──────┴┴──────┴┴──────┴┴──────┴──────────────────────┴─────────────────────────┤
│ Drag to move · handles to resize · Alt = no snap       x 3.12  y 1.40 m       engine 60 fps      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Escritorio — `Room` (planta)

```
┌─────────┬──────────────────────────────────────────────────────────────┬─────────────────────────┐
│ 1 Room  │ [Select][Wall][Polyline][Measure] │ Plan… │ [Plan|Strip]     │ WALL · P2               │
│         │                                                              │ Name   [Pantalla 2    ] │
│         │                 P1 · 6.48 m                                  │ Id     [P2]             │
│         │         (●)━━━━━━━━━━━━━━━━━━━━━━━(●)                        │ Width  [7.353] m        │
│         │          ┃            ↓           ┃                          │ Height [3.500] m        │
│         │          ┃         ◎ S1           ┃                          │   touch surface         │
│         │  P4      ┃                        ┃  P2                      │ Scan plane [0.02] m     │
│         │  7.33 m  ┃ →                    ← ┃  7.35 m  ← seleccionado  │ Enabled  (on)           │
│         │          ┃ ◎ S4              S2 ◎ ┃                          │─────────────────────────│
│         │          ┃                        ┃                          │ ROOM                    │
│         │          ┃           ↑            ┃                          │ 4 walls · 27.6 m        │
│         │         (●)━━━━━━━━━━━━━━━━━━━━━━━(●)                        │ Floor 6.4 × 7.3 m       │
│         │                 P3 · 6.41 m   ▯ puerta                       │                         │
│         │                                                              │ [+ Wall] [Templates…]   │
└─────────┴──────────────────────────────────────────────────────────────┴─────────────────────────┘
```

### 8.3 Escritorio — `Mapping` (dos vistas enlazadas)

```
┌─────────┬──────────────────────────────────────────────────────────────┬─────────────────────────┐
│ 2 Map   │ [Select] [Rect|Corners|Grid] [+Row][+Col] │ Layout… │ [Wall] │ POINT · P2 / B3         │
│         │  OUTPUT · 3840 × 2400 px           │ WALL · P2 · 7.35 × 3.5 m│ Pixel  x [2874] y [431] │
│         │ ┌──────────────┬──────────────┐    │ ┌─────────────────────┐ │ Wall   x 3.68  y 1.75 m │
│         │ │ P1           │ P2 (A1)─(A2)─(A3) │ │ ·     ·     ·     · │ │ Source  touched         │
│         │ │              │     │    │    │   │ │                     │ │ Residual 4 mm           │
│         │ │              │    (B1)─(B2)─(B3)◀┼▶│ ·     ·    (●)    · │ │─────────────────────────│
│         │ │              │     │    │    │   │ │                     │ │ WALL · P2               │
│         │ ├──────────────┼────(C1)─(C2)─(C3) │ │ ·     ·     ·     · │ │ Content X[1920] Y[0]    │
│         │ │ P3           │ P4           │    │ │   ◉ toque en vivo   │ │         W[1920] H[912]  │
│         │ │              │              │    │ └─────────────────────┘ │ Level   Grid 3 × 3      │
│         │ │              │              │    │  rejilla 0.5 m          │ ● inside canvas         │
│         │ └──────────────┴──────────────┘    │  puntos = control       │ ● no overlaps           │
│         │  fondo: Content underlay (off)     │                         │ [Reset]                 │
└─────────┴──────────────────────────────────────────────────────────────┴─────────────────────────┘
```

### 8.4 Escritorio — `Sensors`

```
┌─────────┬──────────────────────────────────────────────────────────────┬─────────────────────────┐
│ 3 Sens  │ [Select][Auto-align][Background][Level check] │ Add ▾        │ SENSOR · S2             │
│         │                       ╭─ anillo de giro                      │ ┌──────┬──────┐         │
│         │                    ⟲ (◎) S2   [Flip]                         │ │ Data │ Rate │         │
│         │   ┌ · · · · · · · · · ╱│╲ · · · · · · · · · · · · · · ·┐     │ │ 30 ms│ 10 Hz│         │
│         │   ·                  ╱ │ ╲          abanico de alcance ·     │ ├──────┼──────┤         │
│         │   ·   ░░ roce con la pared (rojo)                      ·     │ │Restar│ Backg│         │
│         │   ·                                                    ·     │ │  0   │ 2 min│         │
│         │   ·              ◉  mano detectada                     ·     │ └──────┴──────┘         │
│         │   ·                                                    ·     │ ▁▁▁▁▂▁▁▁▁▁▁▁  10 min    │
│         │   └ · · · · · · · · · · · · · · · · · · · · · · · · · ·┘     │─────────────────────────│
│         │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ línea gris del suelo sobre y = 0 ▓▓▓▓▓▓▓▓▓▓   │ Wall [P2 ▾]             │
│         │ ▓ pared vecina                                pared vecina ▓ │ IP   [192.168.11.12]    │
│         │                                                              │ Pose x 3.68 y 3.80 −90° │
│         │ [All][P1 ●][P2 ●][P3 ●][P4 ●]                                │ [Restart] [Identify]    │
└─────────┴──────────────────────────────────────────────────────────────┴─────────────────────────┘
```

### 8.5 Escritorio — `Outputs` (monitor de señal)

```
┌─────────┬──────────────────────────────────────────────────────────────┬─────────────────────────┐
│ 6 Out   │ [+ Add destination]  │  [Test touch] [Mute all]              │ DESTINATIONS            │
│         │ SOURCES            TouchDesigner · OSC · 127.0.0.1:9000      │ ● TouchDesigner  OSC    │
│         │ ● Touches 12/s ──▶ ┌──────────────────────────────────────┐  │   118 msg/s  confirmed  │
│         │ ● Zones    2   ──▶ │ /vt/wall/P2/touch 412 .41 .62 … 60/s │  │ ● Wall mask    Spout    │
│         │ ● Room         ──▶ │ /vt/wall/P2/down  413 .52 .33        │  │   60 fps  1920×1200     │
│         │                    │ /vt/zone/Z1/enter 1                  │  │ ○ Resolume    Triggers  │
│         │ [filter…] [Pause]  │ /vt/room/count    3            60/s  │  │   off                   │
│         │                    └──────────────────────────────────────┘  │─────────────────────────│
│         │ ─────────────────────────────────────────────────────────── │ TOUCHDESIGNER · OSC      │
│         │ Wall mask · Spout · «VEATION Touch»                          │ Host [127.0.0.1] :[9000]│
│         │ ┌───────────────┬───────────────┐                            │ Coords [Per wall 0–1 ▾] │
│         │ │           ●   │    ●●         │  vista previa exacta de    │ Rate   [60] Hz          │
│         │ ├───────────────┼───────────────┤  la textura enviada        │ Walls  [P1][P2][P3][P4] │
│         │ │  ●            │               │                            │ ▸ How to receive this   │
│         │ └───────────────┴───────────────┘                            │ [Test touch] [Delete]   │
└─────────┴──────────────────────────────────────────────────────────────┴─────────────────────────┘
```

### 8.6 Tablet vertical — `Calibrate` en modo foco (durante y resultado)

```
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ P2 · Pantalla 2 · S2         ⋯   │   │ P2 · Result                  ⋯   │
│ ● ● ● ○ ○ ○ ○ ○ ○      4 of 9    │   │  RMS 6 mm   Worst 14 mm   LOO 8  │
├──────────────────────────────────┤   ├──────────────────────────────────┤
│                                  │   │                                  │
│ ┌──────────────────────────────┐ │   │ ┌──────────────────────────────┐ │
│ │                              │ │   │ │                              │ │
│ │  ✓        ✓        ✓         │ │   │ │  ·→       ·        ←·        │ │
│ │                              │ │   │ │                              │ │
│ │     ╭───╮                    │ │   │ │  ·       ↗·         ·        │ │
│ │     │ ◎ │ → 2.1 m     ○      │ │   │ │        14 mm                 │ │
│ │     ╰───╯                    │ │   │ │  ·        ·         ·↓       │ │
│ │  ○        ○        ○         │ │   │ │                              │ │
│ └──────────────────────────────┘ │   │ └──────────────────────────────┘ │
│                                  │   │   vectores de error ×10          │
│      Touch and hold the          │   │                                  │
│      amber target                │   │   [ Redo worst point ]           │
│                                  │   │   [ Add point ]                  │
├──────────────────────────────────┤   ├──────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ │   │ ┌──────────┐ ┌─────────────────┐ │
│ │ Undo   │ │ Skip   │ │ Pause  │ │   │ │ Discard  │ │ Apply & verify  │ │
│ │ last   │ │        │ │        │ │   │ │          │ │                 │ │
│ └────────┘ └────────┘ └────────┘ │   │ └──────────┘ └─────────────────┘ │
└──────────────────────────────────┘   └──────────────────────────────────┘
        botones de 64 px                    el fondo destella al capturar
```

### 8.7 Tablet vertical — mando de `Mapping` en la pared

```
┌──────────────────────────────────┐
│ P2 · Mapping · Corners       ⋯   │
│ Point  ◀  A1 (top left)  ▶       │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │(●)A1                    A2( )│ │   tocar un punto lo elige
│ │                              │ │   (en la pared: ese punto
│ │                              │ │    en ámbar, con cruz grande)
│ │( )B1                    B2( )│ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │                              │ │
│ │       arrastrar aquí         │ │   panel táctil: movimiento
│ │    para mover el punto       │ │   relativo; el dedo no tapa
│ │                              │ │   nada
│ │        [1:1]  [fine]         │ │
│ └──────────────────────────────┘ │
│   [◀] [▲] [▼] [▶]   step [1][5][25] px
├──────────────────────────────────┤
│ ┌────────┐ ┌──────────┐ ┌──────┐ │
│ │ Undo   │ │ Touch to │ │ Done │ │
│ │        │ │ pin      │ │      │ │
│ └────────┘ └──────────┘ └──────┘ │
└──────────────────────────────────┘
```

### 8.8 Tablet apaisada — `Zones` con cajón

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ◉  Barcelona XR Lab ▾   [SETUP] SHOW        ● 4/4  ● 2        ▣ 2   Dim   Projection ▾ │
├───────┬──────────────────────────────────────────────────────────┬─────────────────────┤
│ Live  │ [Select] [Zone] [Mask] [By touch]   Snap   ⟲ ⟳           │ ║ ZONE · Z1         │
│ Room  │                                                          │ ║ [P2 centre      ] │
│ Map   │   ┌──────────────────────────────────────────────────┐   │ ║ [Trigger][Hold]   │
│ Sens  │   │              S2 ◎                                │   │ ║ Hold after 1000ms │
│ Cal   │   │      ( )────( )────( )                           │   │ ║                   │
│ Zones │   │      ( ) P2 centre ( )        ◉                  │   │ ║ ● idle            │
│ Out   │   │      ( )────( )────( )                           │   │ ║ [ Fire ]          │
│       │   └──────────────────────────────────────────────────┘   │ ║ [ Delete ]        │
│       │   [All] [P1] [P2 ·1] [P3] [P4]                           │ ║  ← cajón plegable │
└───────┴──────────────────────────────────────────────────────────┴─────────────────────┘
```

### 8.9 `Live` — escritorio y teléfono

```
┌─────────┬──────────────────────────────────────────────────────────────┬──────────────┐  ┌───────────────────┐
│ Live    │ ● ALL SYSTEMS RUNNING   Sensors 4/4  Touches 7  Out 118/s  6h│ WALLS        │  │ ◉ XR Lab ▾   ● ●  │
│         │──────────────────────────────────────────────────────────────│ P1 ● 2  10Hz │  ├───────────────────┤
│         │  ┌────────┐ ┌─────────┐ ┌────────┐ ┌─────────┐               │ P2 ● 1  10Hz │  │ ● ALL RUNNING     │
│         │  │  ◉  ◉  │ │   ◉     │ │ ◉   ◉  │ │    ◉    │               │ P3 ● 2  10Hz │  │ 4/4 · 7 touches   │
│         │  └────────┘ └─────────┘ └────────┘ └─────────┘               │ P4 ● 1  10Hz │  ├───────────────────┤
│         │   P1          P2          P3          P4                     │──────────────│  │ ┌───────────────┐ │
│         │                                                              │ OUTPUTS      │  │ │  P2   ◉   ◉   │ │
│         │  ▁▂▃▅▃▂▁▁▂▃▂▁  toques · últimos 10 min                       │ ● TD   118/s │  │ └───────────────┘ │
│         │                                                              │ ● Spout 60fps│  │ ‹ P1  P2  P3  P4 ›│
│         │  [Mute outputs] [Re-capture background…] [Verify]            │ ZONES        │  ├───────────────────┤
│         │  ▸ Incidents (1)   21:14–21:15  S3 offline, recovered        │ Z1 ● active  │  │ [ Mute outputs ]  │
└─────────┴──────────────────────────────────────────────────────────────┴──────────────┘  │ [ Verify ]        │
                                                                                           │ Live  Cal  ⋯ More │
                                                                                           └───────────────────┘
```

### 8.10 Panel `Connect a device` y pantalla `Pair this device`

```
┌──────────────────────────────────────────────────────┐   ┌──────────────────────────────┐
│ Connect a device                               Close │   │        VEATION Touch         │
├──────────────────────────────────────────────────────┤   │                              │
│ 1 NETWORK                                            │   │     Pair this device         │
│ ◉ Wi-Fi         172.16.2.42   Public   recommended   │   │                              │
│ ○ Ethernet      172.17.1.51   Public                 │   │   ┌──┐┌──┐┌──┐ ┌──┐┌──┐┌──┐  │
│ ⊘ Ethernet 2    192.168.11.100   sensor network      │   │   │4 ││8 ││2 │ │  ││  ││  │  │
│                                                      │   │   └──┘└──┘└──┘ └──┘└──┘└──┘  │
│ 2 CHECKS                                             │   │                              │
│ ✓ Server listening on :8770                          │   │  Ask the operator at the     │
│ ✗ Windows Firewall blocks incoming connections [Fix] │   │  server for the 6-digit code │
│ ! No other devices seen on this Wi-Fi                │   │  (Connect a device).         │
│                                                      │   │                              │
│ 3 CODE                                               │   │  Server  172.16.2.42:8770    │
│  ┌────────┐   Scan, or open  172.16.2.42:8770        │   │                              │
│  │   QR   │   and enter      482 · 915   (4:12)      │   └──────────────────────────────┘
│  └────────┘                                          │
│                                                      │
│ 4 WAITING FOR THE DEVICE…                            │
│ ○ Nothing has reached this computer yet (0:14)       │
│   [Didn't work — try next network]                   │
│──────────────────────────────────────────────────────│
│ PAIRED DEVICES   iPad · 172.16.2.87 · now   [Remove] │
└──────────────────────────────────────────────────────┘
```

---

## 9. Hoja de ruta priorizada

Esfuerzo orientativo en días de desarrollo: **S** ≤1 · **M** 2–3 · **L** 4–6 · **XL** >6. «Motor» indica cambios
fuera de `ui/` (comandos nuevos, esquema del perfil, proceso principal de Electron).

### Fase 1A — siguiente iteración: que el lienzo trabaje (responde al primer comentario)

| # | Entrega | Esf. | Motor | Riesgo |
|---|---|---|---|---|
| 1 | **Arquitectura de espacios de trabajo**: módulos por herramienta, `Viewport`, máquina de estados de puntero, panel por claves, foco en un muro, navegador de muros, barra contextual, rail de pasos, `SETUP / SHOW` | L | No | Regresiones; migrar herramienta a herramienta con la vista actual como respaldo |
| 2 | **Zonas y máscaras con manipulación directa**: mover, redimensionar, ajuste, duplicar, `Undo` | M | `profile.undo/redo` | Bajo |
| 3 | **Sensores**: arrastrar y girar, nube legible, geometría esperada, bloque de salud | M | No | Bajo; lo fino depende del hardware |
| 4 | **Calibración en modo foco**: pantalla completa, realimentación en la pared, motivos, `Undo last`, mapa de error, `Redo worst point`, `Verify` | L | `calib.redo`, motivos en el estado de la sesión, modo `verify` en la proyección, pausar el simulador | Medio: umbrales sin validar |
| 5 | **Emparejamiento**: tarjetas de red, comprobación y arreglo del cortafuegos, confirmación en vivo, código de 6 dígitos, mensajes de conexión diferenciados | M | `/api/pair`, `net.status`, consulta de reglas en `app/main.js` | Bajo; probar en iPad y Android reales |

### Fase 1B — sala, mapeo y formatos (responde al segundo comentario)

| # | Entrega | Esf. | Motor | Riesgo |
|---|---|---|---|---|
| 6 | **Mapping v1**: vista `Output` con regiones arrastrables, repartos, avisos de solape; nivel `Corners`; patrón `Mapping` en la proyección y mando desde la tablet | L | Esquema 2 (`wall.mapping`), muro→píxel proyectivo, pruebas | Medio: es un cambio de modelo; `Rect` debe dar resultados idénticos a hoy (prueba de regresión) |
| 7 | **Salidas v1**: monitor de señal, `Test touch`, **`OSC triggers`**, **textura por Spout** (`Touch mask`, `Soft mask`, lienzo completo) | L | Tipos de salida nuevos, rasterizador, empaquetar el addon de Spout | Medio: compilar y distribuir un addon nativo en este repositorio; medir el coste de subir la textura |
| 8 | **Asistente `New room`** con plantillas y dimensiones (sobre `Strip` y `Output`) | M | No | Bajo |

### Fase 2 — precisión y hardware real

| Entrega | Esf. | Motor | Depende de |
|---|---|---|---|
| **Mapping `Grid`**, `Touch to pin`, separación pose/mapeo en la calibración (pose rígida, residuo en rejilla, validación dejando uno fuera) | XL | Sí (geometría, calibración, esquema) | Sensores reales para decidir entre pose rígida y homografía por sensor |
| `Auto-align` a partir del suelo y las paredes vecinas | M–L | Sí | Sensores reales |
| `Level check` (roce, línea de suelo, galga) | M | Sí | Sensores reales; soporte de montaje |
| Descubrimiento de sensores y asignación de dirección | M | Sí (`sensor.scan`, `setStaticIp`) | Validar `setStaticIp` |
| Textura por **NDI**, un emisor por muro, `Trails`, `Zones matte`, `Pattern` | M | Sí (addons a instancias) | Revisar términos de NDI |
| `Content underlay` (imagen fija; después Spout/NDI de entrada) | M | Sí | — |
| Espacio `Plan` y creación «desde un plano» | L | Esquema (`wall.plan`) | — |
| `Show lock`, franja de salud, lista de incidencias | M | Poco | — |
| Versiones del perfil en `System` | S | Listado de copias | — |

### Fase 3 — después

Punto de acceso propio activado desde la app · nombre local (`.local`) · control exclusivo durante la calibración y
dispositivos en lectura · HTTPS con autoridad local para tablets del estudio · zonas poligonales y entre muros ·
MIDI, Art‑Net/sACN y *webhooks* como disparadores · grabación y reproducción de sesiones · varios sensores por muro
con vista de solape · hoja de atajos de teclado.

### Riesgos generales

1. **Sin sensores reales, tres piezas son hipótesis**: la pose rígida frente a la homografía, `Auto-align` y `Level
   check`. Por eso van en fase 2 y la fase 1 no depende de ellas.
2. **El cambio de modelo del mapeo** toca el corazón del sistema. Mitigación: `Rect` idéntico al comportamiento actual
   con prueba de regresión; el contrato de salida no cambia.
3. **Addons nativos** en un proyecto que hoy no compila nada: afecta a `npm install`, a la construcción del instalador
   y a las pruebas. Mitigación: dependencia opcional con degradación limpia, como ya hace VEATION.
4. **Alcance.** Las fases 1A y 1B suman del orden de 25–30 días. Si hay que recortar, el orden de valor es 1 → 4 → 5 →
   2 → 6 → 7 → 3 → 8.
5. **La referencia lidar-ui aún no está incorporada.** Puede cambiar prioridades de `Mapping`, `Calibrate` y `Sensors`
   (Anexo D). Conviene leer `ANALISIS-LIDAR-UI.md` antes de empezar los puntos 4 y 6.

---

## Anexo A — Comandos y servicios nuevos del motor

Todo lo que hoy es `profile.update` con el perfil entero puede seguir así; lo de abajo es lo que no existe.

| Comando / servicio | Para qué | Fase |
|---|---|---|
| `profile.undo`, `profile.redo`, `profile.history`, `profile.restore {version}` | Deshacer compartido entre dispositivos; versiones | 1A |
| `calib.start {session: quick\|standard\|fine, source: projection\|texture\|physical}` | Tipos de sesión y fuente de dianas | 1A / 2 |
| `calib.redo {index}`, `calib.addTarget {x, y}`, `calib.pause`, `calib.resume` | Rehacer el peor punto, añadir puntos, pausar | 1A |
| Estado de la sesión: `seen {sensorId: n}`, `reason: multiple\|large\|none` | Decir por qué no captura | 1A |
| `verify.start`, `verify.stop`, `verify.fix {x, y}` | Verificación con cursor proyectado y corrección puntual | 1A |
| `projection.set {mode: mapping\|verify\|pattern, wallId, point, dim}` | Patrones nuevos en la proyección | 1A / 1B |
| `mapping.nudge {wallId, point, dx, dy}`, `mapping.pin {wallId, point}` | Empujones de baja latencia desde la tablet; fijar por toque | 1B / 2 |
| `output.test {id, kind: touch\|trigger\|pattern}`, `output.monitor {id, on}`, `outputs.mute {on}` | Pruebas reales, monitor de señal, silencio general | 1B |
| Tipos de salida `triggers` y `texture`; respuesta `/vt/pong` | Formatos nuevos; confirmación del receptor | 1B |
| `net.status` (interfaces, perfil, reglas de cortafuegos, vecinos), `net.fixFirewall` | Diagnóstico del emparejamiento (proceso principal) | 1A |
| `POST /api/pair {code}` → clave; `pair.code`; `devices.list`, `devices.remove` | Emparejar con código; gestionar dispositivos | 1A |
| `sensor.scan {subnet}`, `sensor.probe {host}`, `sensor.setIp {id, ip}`, `sensor.identify {id}` | Descubrimiento y puesta en marcha | 2 |
| `sensor.autoAlign {id}`, `sensor.levelCheck {id}` | Pose automática; ayuda de nivelado | 2 |
| `show.lock {on}`, registro de incidencias en `status` | Operación | 2 |
| `underlay.set {source}` (imagen, Spout, NDI) | Contenido de fondo | 2 |

## Anexo B — Cambios en el esquema del perfil (esquema 2)

| Campo | Cambio | Migración desde el esquema 1 |
|---|---|---|
| `walls[].mapping` | `{ level: rect\|corners\|grid, us[], vs[], points[[px,py]…], measured[[x,y]\|null…] }` | `rect` con las cuatro esquinas de `pixelRect` |
| `walls[].pixelRect` | Se conserva: es la **región de contenido** del muro (base de `u, v`) | Sin cambio |
| `walls[].plan` | `{ x, y, angle }` opcional (planta) | Ausente = sólo tira |
| `sensors[].calibration.kind` | Añade `rigid` (`x, y, rotation, mirror, scale`) junto a `homography` y `affine` | Sin cambio; las existentes siguen valiendo |
| `zones[].behaviour`, `zones[].minHands` | `trigger\|hold\|counter\|toggle` | `hold` si `holdMs > 0`; si no, `trigger` |
| `outputs[].type` | Añade `triggers` (con `rules[]`) y `texture` (con `transport`, `content`, `scale`, `fps`…) | Sin cambio |
| `outputs[].coords` | Añade `pixels` y `metres` | Sin cambio |

## Anexo C — Qué hay que validar con sensores reales antes de cerrar el diseño

1. ¿La pose rígida basta, o el S2E necesita además una escala o una corrección de alcance? Decide el modelo de §3.5.
2. ¿Se ven con claridad el suelo y las paredes vecinas en el fondo como para `Auto-align`?
3. ¿Qué señales reales da un plano mal nivelado? Decide `Level check`.
4. Umbrales: RMS aceptable, tiempo de mantener, tolerancia de estabilidad; tiempo real por muro.
5. ¿Cuántos puntos hacen falta para que la rejilla mejore y no sobreajuste?
6. Coste de publicar la textura a 60 fps con el motor trabajando; resolución por defecto.
7. `setStaticIp` y el comportamiento de varios S2E nuevos en la misma dirección de fábrica.
8. Con una tablet real: legibilidad a oscuras, alcance del pulgar, si el modo `Dim` basta, si el sonido se oye en sala.

## Anexo D — Dónde debe entrar el análisis de lidar-ui (`[REF lidar-ui]`)

Cuando exista `docs/ux/ANALISIS-LIDAR-UI.md`, revisar estos puntos y actualizar la propuesta:

| Sección | Pregunta que debe responder el análisis | Qué cambiaría aquí |
|---|---|---|
| §3.2 Espacios de trabajo | ¿Su vista central es la del sensor (nube) o la de la superficie? ¿Cómo cambia entre montar, rastrear y calibrar? | Vista por defecto de `Sensors`; nombres y orden de los pasos del rail |
| §3.5 Mapping | ¿Cómo define el área interactiva? ¿Recorta o deforma? ¿Qué vocabulario usa? | Nivel por defecto (`Rect` / cuatro esquinas tocadas); si la rejilla es avanzada |
| §3.6 Sensors | ¿Qué ayuda da para orientar y nivelar el sensor? ¿Qué muestra de salud? | `Level check`, `Sensor view` |
| §3.7 Calibrate | Pasos, número de toques, realimentación, corrección y verificación de su calibración multitáctil | Sesión por defecto (`Quick` con marcas físicas frente a `Standard` con dianas) |
| §3.9 Outputs | Formatos, cómo se eligen, vista previa, estructura del receptor de TouchDesigner, formato de su textura | Valores por defecto de `Texture`; el ejemplo descargable; el selector por uso |
| §4 Flujos | Tiempo y número de pasos reales desde abrir la app hasta tener toques en TouchDesigner | Objetivos de tiempo; qué pasos del asistente sobran |
| §9 Hoja de ruta | Qué le falta a lidar-ui que aquí sí se propone (varios sensores, muro→píxel para varios muros, tablet, perfiles) y qué hace mejor | Prioridades de 1A / 1B |
