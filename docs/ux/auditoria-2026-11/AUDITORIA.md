# VEATION Touch — Auditoría de concepto, UX/UI y calibración

**Versión auditada:** 0.1.0 (commit `14c4cea`) · **Fecha:** 2026-11-16 · **Alcance:** sólo lectura; no se ha tocado código,
perfiles ni documentos existentes.

**Método.** Lectura completa de la interfaz (`ui/index.html`, `ui/app.css`, `ui/js/*.js`), del motor en lo que afecta a
la interacción (`engine/engine.js`, `profile.js`, `server.js`, `core/calibration.js`, `autoalign.js`, `levelcheck.js`,
`corners.js`, `zones.js`, `pipeline.js`), de `app/main.js`, de la documentación (`ARCHITECTURE.md`, `docs/OSC.md`,
`docs/MANUAL-OPERACION.md`) y de las dos referencias de diseño (`docs/ux/PROPUESTA-UX.md`, `docs/ux/ANALISIS-LIDAR-UI.md`).
Revisión de las 25 capturas de `capturas/` y un recorrido propio con el motor en marcha sobre una carpeta de datos
temporal (sala nueva creada con el asistente, sensores S2E sin hardware, calibración y verificación completas con manos
simuladas, tablet apaisada y vertical). Las 13 capturas nuevas llevan el prefijo `extra-`.

**Límites.** No hay hardware: los tiempos son **estimaciones** a partir del número de pantallas, clics y esperas, no
mediciones. Todo lo que depende del S2E real va marcado **[hardware]**. Los textos de interfaz se citan en inglés tal
como aparecen.

**Severidad.** **Crítico** = impide la tarea o produce un resultado erróneo sin avisar · **Alto** = la tarea se hace con
mucho esfuerzo o exige saber algo que la interfaz no dice · **Medio** = fricción clara · **Bajo** = pulido.

---

## 1. Resumen ejecutivo

### Veredicto

**El sistema está bien concebido y mal encaminado.** El modelo (sala → muros en metros → lienzo de contenido en
píxeles; un toque continuo a través de las esquinas; perfiles por sala; motor que sirve la misma interfaz al escritorio
y a la tablet) es correcto, es mejor que el del producto de referencia y no hay que rehacerlo. La manipulación directa
en el lienzo, el deshacer, el modo foco de calibración, `Auto-align`, `Level check`, `Verify`, el control exclusivo de la
sesión y la variedad de salidas son piezas de nivel profesional.

Lo que falla es **el camino**. Hoy el software es una caja de herramientas competente que supone que el operador ya
sabe en qué orden usarlas, dónde está cada una y cuáles puede saltarse. Para el objetivo del propietario —«calibrar y
dejar lista la sala en muy poco tiempo»— faltan tres cosas, por este orden:

1. **Una ruta guiada con estado** (qué falta, dónde se resuelve, qué viene después).
2. **Acciones por sala, no por sensor** (hoy todo se repite cuatro veces, a mano y en paneles con scroll).
3. **Una vía rápida de calibración** (pose automática + verificación) que deje la calibración de 9 dianas por muro como
   refinamiento, y que **compruebe las esquinas**, que son el requisito clave y hoy no se miden.

Además hay **seis defectos visibles** que conviene arreglar antes de enseñar el producto a nadie (bloque 6 de la lista).

### Los 10 problemas más importantes

| # | Problema | Sev. | Evidencia principal |
|---|---|---|---|
| 1 | **No hay ruta de puesta en marcha ni estado por paso.** Tras `Create room` la app se queda en `Room` sin decir qué sigue; el rail son 8 pestañas planas sin indicador de «listo / falta»; no existe `SETUP / SHOW`. | Crítico | `ui/index.html:30-39`, `views.js:334`, [extra-01](capturas/extra-01-wizard-after-create.png) |
| 2 | **Todo se hace sensor a sensor.** Fondo, `Auto-align` y `Level check` son botones pequeños dentro del inspector de *un* sensor, y en orden contrario al de uso (`Mounting` antes que `Background`). El motor ya acepta `bg.capture` para toda la sala; la interfaz no lo ofrece. | Alto | `views.js:391-422`, `engine.js:543-548`, [05](capturas/05-sensors.png) |
| 3 | **La calibración sólo ofrece el camino largo** (3×3 dianas por muro) y `Health` la presenta como obligatoria («not calibrated»), aunque `Auto-align` + `Verify` pueden bastar. No hay sesión rápida ni modelo rígido; la homografía se ajusta en la franja 0,45–1,9 m y se extrapola al resto del muro. | Alto **[hardware]** | `calibration.js:8,146`, `views.js:86`, `PROPUESTA-UX.md §3.5/§3.7` |
| 4 | **Las esquinas continuas —el requisito clave— no se verifican nunca.** Dianas y puntos de `Verify` quedan a ≥ 12 % del ancho de cada esquina (≈ 0,8 m en XR Lab); no hay prueba de cruce. En salas en L o en U el enlace viene **desactivado** por defecto sin que el asistente lo pregunte. | Alto **[hardware]** | `calibration.js:8,175-178`, `profile.js:223-224` |
| 5 | **La proyección es una dependencia oculta y frágil.** La pantalla se elige al fondo de `System`; la comprobación «Projection window open» se marca en verde sin pantalla elegida y sin ninguna página de proyección conectada; la ventana sólo cubre **un** monitor; no hay alternativa si el contenido sale de otra máquina. | Alto | `views.js:575`, `app/main.js:120-128`, [extra-05](capturas/extra-05-calibrate-not-ready.png) |
| 6 | **Defectos visibles:** el editor de una salida **TUIO no se abre** (excepción); el diálogo `Discover` imprime «null»; en `System › Room profiles` los nombres de sala **no se ven**; el asistente ignora `Canvas width (px)` en modo tira; los eventos de la sala anterior siguen en `Events`; etiquetas superpuestas en `Room` y en el teléfono; `Undo` tapado por la barra en `Zones`. | Crítico (TUIO) / Alto | `views.js:816`, `views.js:471`, `views.js:959-965`, `views.js:313`, [extra-09](capturas/extra-09-outputs-tuio-no-editor.png), [extra-04](capturas/extra-04-discover-null.png), [extra-06](capturas/extra-06-system-profiles-truncated.png) |
| 7 | **El asistente `New room` es un formulario de una pantalla**: un único ancho para todos los muros, sin nombres ni ids, sin pantalla de proyección, sin destino de salida, sin pregunta de esquinas. Y existe un segundo camino distinto (`System › + New`) que crea una sala en blanco de un muro simulado. | Alto | `views.js:282-336`, `views.js:983-986`, [14](capturas/14-new-room-wizard.png) |
| 8 | **La sesión de calibración no explica ni avisa.** Si el sensor ve dos objetos o un cuerpo, el candidato se descarta en silencio; sin sonido, vibración ni pantalla encendida; `Cancel` pegado a `Skip target`; el resultado es una tabla sin mapa de error; no encadena con el muro siguiente; las manos errantes del simulador capturan dianas. | Alto | `calibration.js:54,159-167`, `views.js:651-654`, [telefono-05](capturas/telefono-05-calibrate-session.png), [extra-07](capturas/extra-07-calibrate-result.png) |
| 9 | **Operación diaria coja.** `Show` bloquea también `Verify` y la recaptura de fondo (las dos recuperaciones más habituales); no hay `Mute outputs` ni historial de incidencias; `Health` no ofrece acciones; cambiar de sala en la barra superior no pide confirmación; una tablet sin clave ve «Reconnecting…» para siempre; no hay código de 6 dígitos. | Alto | `engine.js:659-663`, `app.js:427`, `conn.js:64-70`, `index.html:66` |
| 10 | **Espacio de trabajo y ergonomía táctil.** En `Live › All` la sala ocupa ≈ 14 % del lienzo; en `Outputs` y `System` el lienzo muestra un muro que no tiene que ver con la tarea (42 % de la pantalla del teléfono); la barra contextual se desborda (3 filas en tablet apaisada); objetivos táctiles de 34–38 px; las asas tapan las zonas pequeñas; la tablet apaisada recibe la disposición de escritorio. | Medio | `workspace.js:130-148`, `app.css:24,72,104`, [01](capturas/01-live-2d.png), [telefono-07](capturas/telefono-07-outputs.png), [extra-10](capturas/extra-10-tablet-landscape-zones.png) |

### Tiempo hasta el primer toque (estimaciones, sala de 4 muros con sensores ya montados y cableados)

| Hito | Hoy (operador que ha leído el manual) | Hoy (operador nuevo, sin manual) | Objetivo razonable |
|---|---|---|---|
| Primer toque visible en `Live` (un muro, sin calibrar) | ≈ 15 min | 30 min o no llega (no sabe que hace falta fondo ni dónde está) | ≤ 5 min con los sensores ya direccionados; ≤ 10 min incluyendo IPs |
| Primer toque **correcto** llegando al receptor (un muro verificado + OSC) | ≈ 25–30 min | 45–60 min | ≤ 8–10 min |
| Sala completa de 4 muros, verificada y bloqueada | ≈ 50–75 min | 90 min o más | **≈ 18–25 min** (≈ 12–15 min si la pose automática pasa `Verify` en todos los muros) |

No se incluye el nivelado físico de los soportes ni el cambio de IP con RoboStudio si `setStaticIp` no se valida
(ambos **[hardware]**). La mayor parte del ahorro no viene de acelerar pasos sino de **eliminar repeticiones** (×4) y
**desplazamientos entre herramientas** (≈ 25 cambios de herramienta y ≈ 110 clics hoy para la sala completa).

---

## 2. Recorrido del operador paso a paso

Sala nueva (no XR Lab), 4 muros, un S2E por muro. «Debe saber» = conocimiento que la interfaz no da.

| # | Paso | Pantallas y clics hoy | Debe saber | Fricciones y riesgos | Hoy | Objetivo |
|---|---|---|---|---|---|---|
| 1 | Instalar y primer arranque | Instalador → la app abre en `Live` con «Barcelona XR Lab (simulated)» y manos errantes | Que eso es una demo y que su sala se crea en `Room › New room…` | No hay pantalla de bienvenida ni «sala vacía»; un operador nuevo ve una sala ajena funcionando y ningún «empezar aquí». | 3 min | 2 min |
| 2 | Crear la sala | `Room` → `New room…` → 8 campos → `Create room` → queda en `Room` → por cada muro: seleccionar, `Name`, `Width` (×4) | Que el ancho del asistente es común; que los ids serán `W1…W4` y no se pueden cambiar; que `Canvas width (px)` no se usa en tira | Un solo `Wall width (m)` para todos; `Canvas width (px)` se pisa en silencio (`views.js:313`: pidió 3840, creó 7296); sin siguiente paso; `System › + New` hace otra cosa. | 5–6 min | 2 min |
| 3 | Lienzo y píxeles (`Mapping`) | `Mapping` → revisar regiones → ajustar `X Y W H` por muro → `System` (scroll hasta `Projection`) → `Projection on` → `Projection window` → volver a `Mapping` → `Show pattern on walls` | Que la pantalla de proyección se elige en `System`; que `Show pattern on walls` e `Identify` son lo mismo | Dependencia oculta; sin avisos de solape o fuera de lienzo; `Corners` sin cruceta para tablet (sólo `Grid` la tiene, `views.js:244-266`). | 5–8 min | 2–3 min |
| 4 | Sensores: red, IP, asignación | RoboStudio (fuera) ×4 → `Sensors` → `Discover` → `Add` ×4 (o editar `IP address` de los creados por el asistente) → agitar la mano para ver `moving` | Que el PC necesita IP en 192.168.11.x; que hay que conectar los sensores de uno en uno; que `Change IP…` es experimental | Si nada responde el diálogo dice «No unit answered…» seguido de «null» ([extra-04](capturas/extra-04-discover-null.png)) y no comprueba si el PC tiene dirección en esa red (lo podría saber). En `Live`: «offline — no answer (0x6) from 192.168.11.11:8089» sin acción ([extra-02](capturas/extra-02-new-room-live-offline.png)). | 12–20 min **[hardware]** | 5–8 min |
| 5 | Montaje: fondo, alineado, nivel | Por sensor (×4): seleccionar → scroll → `Capture background` → cuenta atrás 5 s + 2 s → scroll arriba → `Auto-align (room empty)` → `Apply` → `Level check` → `Dismiss` | El orden correcto (fondo antes de alinear: el panel los presenta al revés); que al aplicar la pose conviene recapturar | 4 × 3 acciones enterradas en un panel que exige scroll; ningún «todos a la vez»; `Auto-align` y `Level check` deshabilitados sin motivo cuando el sensor no escanea ([extra-03](capturas/extra-03-new-room-sensors-offline.png)). | 6–8 min | 1–2 min |
| 6 | Conectar la tablet | `Connect device` → QR | Que la tablet debe estar en la Wi-Fi correcta | Funciona bien si hay Wi-Fi. Sin código de 6 dígitos; el texto «Pick the network the tablet is on (above)» aparece aunque no haya selector ([13](capturas/13-connect-modal.png)); QR blanco de 220 px deslumbra en sala oscura. | 1–3 min | 1 min |
| 7 | Calibrar (por muro, ×4) | `Calibrate` → muro → lista previa → `Start calibration of Px` → 9 dianas (0,7 s + retirada 0,5 s + caminar) → tabla → `Apply & save` → elegir a mano el muro siguiente | Que 3×3 es necesario (o no); qué RMS es aceptable; qué hacer cuando no captura | Sin motivo cuando no captura; sin sonido; `Cancel` junto a `Skip target`; sin mapa de error; sin «siguiente muro»; la comprobación de proyección puede estar en verde sin proyección. | 10–14 min | 0–6 min |
| 8 | Verificar (×4) | `Verify Px` → 5 puntos → `Done` | Que `Verify` es lo que de verdad importa | Bien resuelto ([extra-08](capturas/extra-08-verify-result.png)). El resultado no se guarda (no queda «P2 verificado ayer, 15 mm»); no prueba esquinas; no encadena. | 4–5 min | 3 min (con esquinas) |
| 9 | Salidas y prueba del receptor | `Outputs` → la sala ya trae «TouchDesigner 127.0.0.1:9000» → `Send test` | Que `Send test` envía sólo `/vt/test`; cómo se recibe en TouchDesigner | Sin monitor de lo enviado; sin toque de prueba con forma reconocible; la URL de WebSocket muestra `127.0.0.1` en el servidor (`views.js:788`); **seleccionar una salida TUIO lanza una excepción** (`views.js:816`). | 3–5 min | 1–2 min |
| 10 | Zonas (opcional) | `Zones` → `Wall`/`Canvas` → `Zone` → dibujar → inspector | Diferencia entre zona de muro y de lienzo | Edición directa buena. Faltan `Define by touch`, `Copy to walls…`, `Align`; campos `x0 y0 x1 y1`. | 3–5 min | 2 min |
| 11 | Bloquear | `Show` | — | Bien. La tablet no arranca bloqueada. | < 1 min | < 1 min |
| | **Total** | ≈ 25 cambios de herramienta | | | **≈ 50–75 min** | **≈ 18–25 min** |

**Día 2.**

| Situación | Hoy | Problema | Objetivo |
|---|---|---|---|
| Inicio de jornada | La app arranca con Windows; `Live › Health` | No hay comprobación rápida: `Verify` está bloqueado en `Show` (`engine.js:661`); hay que desbloquear toda la sala para tocar 5 puntos. | `Verify` disponible en `Show`; resultado y fecha visibles en `Health`. |
| Un sensor recibió un golpe | Nada lo detecta: los toques salen desplazados. El operador debe saberlo, desbloquear, `Sensors` → `Level check` → `Capture background` → `Calibrate` → 9 dianas → `Verify` (≈ 6–8 min) | El motor ya sabe comparar el fondo guardado con lo que ve (`engine.js:426-434`), pero sólo si alguien pulsa `Level check`. | Aviso automático «S3: background no longer matches» y flujo `Re-align S3` (fondo + pose + `Verify`, ≈ 2 min). |
| Toques fantasma | Desbloquear → `Sensors` → sensor → scroll → `Capture background` | No hay `Mute outputs` para cortar el efecto en la pieza mientras tanto. | `Mute outputs` y `Re-capture background…` en `Live`, también en `Show`. |
| Se une una tablet | `Connect device` → QR | Si la tablet abrió la página sin clave (acceso directo de iPad, enlace sin `?k=`), ve «Connection to the engine lost — Reconnecting…» sin fin (`conn.js:64-70`, 401 en `server.js:137-138`). | Pantalla «This device is not paired» con código de 6 dígitos. |
| Alguien cambió algo | `System › Room profiles › Versions` | Funciona; pero en esa lista los nombres de sala no se leen ([extra-06](capturas/extra-06-system-profiles-truncated.png)). | — |

---

## 3. Hallazgos por área

### 3.1 Concepto del sistema

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| C1 | **El modelo de datos es correcto** (muro en metros ↔ lienzo en píxeles ↔ salidas UV; perfiles; motor autoritativo con revisiones). No rehacer. | — | `ARCHITECTURE.md › Coordinates` | Conservar. Ver §5. |
| C2 | **Dos «verdades» de posición del sensor que la interfaz no explica**: la pose medida (`Auto-align`, arrastre) y la homografía por toques. Al calibrar, la pose deja de usarse («Calibrated: the pose below is no longer used for tracking»), pero el operador ha invertido tiempo en las dos y `Health` trata la falta de calibración como aviso. No se dice cuál basta ni cuándo. | Alto | `views.js:392`, `views.js:86`, [05](capturas/05-sensors.png) | Presentar **niveles de precisión**: `Pose (auto)` → `Verified` → `Touch-calibrated`. `Health` sólo avisa si el muro no está *verificado* dentro de umbral, no si le falta la homografía. |
| C3 | **La calibración absorbe el mapeo sin decirlo.** Las dianas se definen en metros de muro y se proyectan a través de `Mapping` (`projection.js`, `uvToCanvas`). Si la imagen no coincide exactamente con el rectángulo físico declarado, la homografía compensa esa diferencia: el toque cae sobre el contenido (bien), pero los «metros de muro» dejan de ser físicos y **cualquier cambio posterior de `Mapping` desplaza los toques sin aviso**. | Alto | `projection.js:87,104-127`, `calibration.js:126-150` | Guardar en `sensor.calibration` una huella del mapeo del muro; si cambia, `Health`: «Mapping of P2 changed after its calibration — verify». Explicar en `Calibrate`: «Targets are drawn through Mapping: check the pattern first». |
| C4 | **Homografía de 8 grados de libertad ajustada sólo en la franja alcanzable** (0,45–1,9 m de un muro de 3,5 m) y con primera columna a 0,12·ancho de la esquina. Extrapola hacia arriba y hacia las esquinas, justo donde se exige continuidad. El modelo rígido propuesto (fase 2 de la propuesta) no existe (`kind` sólo `homography`/`affine`). | Alto **[hardware]** | `calibration.js:8-20,146-147` | Añadir ajuste **rígido/similitud** y elegir por validación dejando-uno-fuera; mostrar ambos residuos. Decidir el modelo por defecto con el S2E real. |
| C5 | **Esquinas continuas sin verificación ni calibración conjunta.** Cada muro se calibra por separado; nada mide si la altura y la posición de un toque coinciden a ambos lados de la esquina. La continuidad del id está probada en simulación, la continuidad *geométrica* no se comprueba en sala. | Alto **[hardware]** | `corners.js` (media ponderada), `calibration.js:175-185` | Paso `Corner check` en `Verify`: deslizar la mano por cada esquina; informar de id único, salto en mm/px en la costura y tiempo ciego. Opción de dianas a 25 cm de cada borde. |
| C6 | **El enlace de esquinas viene desactivado en salas que no cierran** (L, U), aunque sus muros sí se toquen; se resuelve una vez al normalizar y queda fijado. El asistente no pregunta. | Medio | `profile.js:223-224`, `views.js:161` | En el asistente: plantilla de forma (`Single wall`, `Corner`, `U`, `Box`, `Custom`) que fija `joinNext` y `turn` por esquina; por defecto «los muros consecutivos se tocan». |
| C7 | **Toda la calibración depende de proyectar desde este PC.** Sin ventana de proyección no hay dianas; no existen `Pattern over Spout` ni `Physical marks` (propuesta §3.5). En salas cuyo contenido sale de otro equipo o de un procesador con varias salidas, no se puede calibrar. | Alto | `app/main.js:120-128`, `engine/outputs/texture.js` (sólo toques) | Fuente de dianas seleccionable: ventana de proyección · dianas dentro de la textura Spout · marcas físicas (tocar las 4 esquinas de la imagen). |
| C8 | **Modo `Show` todo-o-nada.** Bloquea edición (bien) y también operaciones de mantenimiento (`verify.start`, `bg.capture`). No hay roles por dispositivo: cualquier tablet con la clave puede desbloquear con una confirmación. | Medio | `engine.js:659-663`, `app.js:430-434` | `Show` permite `Verify`, recaptura de fondo (con confirmación) y reinicio de sensor; desbloqueo con pulsación mantenida. A medio plazo, modos `SETUP`/`SHOW` (fase D). |
| C9 | **Control exclusivo de la sesión**: una tablet conduce, las demás miran, `Take control` con confirmación, relevo automático si se desconecta. Bien resuelto. | — | `engine.js:599-623`, `app.js:393-411` | Conservar. |

### 3.2 Organización de herramientas

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| O1 | **El rail no comunica flujo ni estado.** Ocho botones iguales; el orden es el correcto (`Room → Mapping → Sensors → Calibrate → Zones → Outputs`) pero nada lo indica ni dice qué falta. | Crítico | `index.html:30-39`, [extra-01](capturas/extra-01-wizard-after-create.png) | Insignia por herramienta (`✓`, `3/4`, `!`) calculada en cliente con `state`/`status`; separadores `OPERATE · SETUP · CONTENT · SYSTEM`; tarjeta «Next step» en el inspector cuando no hay selección. |
| O2 | **`Sensors` concentra cinco oficios** (red, montaje, fondo, estado, calibración) en un inspector de varias pantallas de alto con las acciones clave como `btn small` entre texto. El orden de las secciones contradice el del manual (§6: fondo → auto-alineado). | Alto | `views.js:375-440`, [05](capturas/05-sensors.png) | Orden: resumen de salud (4 lecturas) → `Background` → `Mounting` (`Auto-align`, `Level check`) → `Calibration` → `Network & scan` plegado → `Details` plegado. Acciones de sala en la cabecera: `Prepare all sensors`. |
| O3 | **`System` es un cajón de 2300 px**: emparejamiento (duplicado de `Connect device`), perfiles (duplicado de `Room`), red, grabaciones, 17 parámetros, aplicación, proyección y registro. Lo que se necesita durante la puesta en marcha (pantalla de proyección) está al final. | Medio | `views.js:950-981`, [12](capturas/12-system.png), [extra-06](capturas/extra-06-system-profiles-truncated.png) | Proyección → popover junto a `Off / Identify / Debug` y dentro de `Mapping`/`Calibrate`. Salas → menú del selector `Room` («Manage rooms…»). `Processing` → `Sensors › Tuning` con presets. `System` queda para aplicación, red, grabaciones y registro. |
| O4 | **Dos caminos distintos para «sala nueva»**: `Room › New room…` (asistente) y `System › + New` (pide sólo un nombre y crea 1 muro de 4 × 2,5 m con sensor simulado). El manual los da por equivalentes. | Medio | `views.js:983-986`, `profile.js:314-323`, `MANUAL-OPERACION.md §5` | `+ New` abre el mismo asistente. |
| O5 | **Un mismo modo con tres nombres**: `Identify` (barra superior), `Show pattern on walls` / `Pattern on walls: on` (`Mapping`), «Projection shows» (`System`). | Bajo | `index.html:23`, `app.js:260`, `views.js:1047-1052` | Un nombre: `Pattern`. |
| O6 | **La vista 3D sólo vive en `Live`**, pero el ángulo de esquina se edita en `Room` («Shapes the room in Live › 3D»): para ver el efecto hay que cambiar de herramienta. | Medio | `views.js:163-164`, `app.js:207-213` | Conmutador `2D | 3D` también en `Room`. A largo plazo, planta editable (fase D). |
| O7 | **Cambio de sala a un clic en la barra superior, sin confirmación**: para sensores, corta salidas y cancela la calibración en curso. Sólo lo impide `Show`. (Era T8 en la propuesta.) | Alto | `app.js:427`, `engine.js:290-295` | Confirmación con el efecto exacto («This stops 4 sensors and 2 outputs»). |

### 3.3 Espacio de trabajo y panel

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| W1 | **`Live › All` desaprovecha el lienzo**: la tira de 28 m ocupa una franja de ≈ 110 px de alto en 1440×900 y de ≈ 50 px en el teléfono; el resto es negro. | Medio | `workspace.js:130-148`, [01](capturas/01-live-2d.png), [telefono-01](capturas/telefono-01-live.png) | Añadir vista **`Canvas`** a `Live` (`2D | 3D | Canvas`): el lienzo de contenido con el fondo y los toques ya mapeados es exactamente «las paredes como un lienzo continuo». En tira, partir en dos filas cuando la relación supera 5:1. |
| W2 | **`Outputs` y `System` muestran un muro que no viene al caso** (el último enfocado), con toques y zonas. En el teléfono ocupa el 42 % superior. | Medio | `app.js:197`, [10](capturas/10-outputs.png), [telefono-07](capturas/telefono-07-outputs.png), [telefono-08](capturas/telefono-08-system.png) | `Outputs`: monitor de señal (últimos mensajes del destino seleccionado; vista previa de la textura). `System`: ocultar el lienzo (panel a todo el ancho en móvil). |
| W3 | **La barra contextual se desborda.** En `Zones › Wall` a 1440 px tapa el botón `Undo` ([08](capturas/08-zones-wall.png): sólo se ve `↷`); en tablet apaisada ocupa tres filas sobre el muro ([extra-10](capturas/extra-10-tablet-landscape-zones.png)); en el teléfono se corta («Virtua…», «Zon…») sin indicio de que hay más. | Medio | `app.css:104,131`, `app.js:192-270` | Reservar el ancho real de `stage-tools`; `Snap` y `Duplicate/Delete` a un menú `⋯` por debajo de 1280 px; degradado de «hay más» en el scroll horizontal. |
| W4 | **Etiquetas que se pisan.** `Room`: el ancho («6.000 m») cae sobre el sensor y su id. Tira en el teléfono: nombres y medidas de los cuatro muros superpuestos. Toques: el id se dibuja encima del propio toque. Zonas vecinas: «Corner P1-P2 Corner P1-P2 · 1». | Medio | `workspace.js:833-841,851,971,1027`, [03](capturas/03-room.png), [extra-01](capturas/extra-01-wizard-after-create.png), [telefono-01](capturas/telefono-01-live.png) | Medir el texto y omitir lo que no cabe; ancho del muro bajo el borde inferior en `Room`; id del toque al lado (o sólo en `Debug`). |
| W5 | **El panel se reconstruye entero** con cada `state`, `status` (2 Hz) y `live` (4 Hz); sólo se protege el foco de `INPUT/SELECT`. En táctil un botón puede ser sustituido entre `pointerdown` y `click` (era T5). | Medio (riesgo; no reproducido sin tablet real) | `app.js:128-144` | No reconstruir mientras haya un puntero pulsado sobre el panel; a medio plazo, actualización por claves. |
| W6 | **Estados deshabilitados sin motivo.** `Auto-align (room empty)`, `Level check`, `Capture`, `Verify W1` aparecen atenuados sin decir por qué; `Start calibration` explica «Capture the background first…» cuando el bloqueo real es que el sensor está `offline`. | Medio | `views.js:503,532,586-588`, [extra-03](capturas/extra-03-new-room-sensors-offline.png), [extra-05](capturas/extra-05-calibrate-not-ready.png) | Motivo junto al control («S1 is offline — Sensors»), con enlace a donde se arregla. |
| W7 | **Lista de eventos con datos de otra sala** tras cambiar de perfil (en «New room» con muros `W1–W4` se ven eventos de `P2`, `P4`). | Bajo | `conn.js:75-78,87`, [extra-02](capturas/extra-02-new-room-live-offline.png) | Vaciar `store.events` al cambiar `profile.id`. |
| W8 | **Formato numérico mezclado**: campos con coma («6,483», «0,45») y lienzo con punto («6.48 × 3.50 m»). Campos sin unidad (`Lowest target`, `Highest target`). (Era T14.) | Bajo | `dom.js:23-38`, `views.js:582-583`, [06](capturas/06-calibrate-checklist.png) | `lang="en"` en los `input` numéricos o formateo propio; unidades siempre visibles. |

### 3.4 Interacción

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| I1 | **Manipulación directa conseguida**: arrastrar zonas, máscaras, sensores, bordes de muro, regiones, esquinas y nodos; ajuste a 1/5/10 cm; empujones con flechas; deshacer con nombre de acción. | — | `workspace.js`, `conn.js:136-159` | Conservar. |
| I2 | **Asas que tapan el objeto en táctil**: 8 asas de 16 px (20 px de zona de impacto) sobre una zona de 1,4 × 1,0 m la cubren entera en el teléfono; los nodos de `Mapping` tapan la tira. No hay lupa. | Medio | `workspace.js:182,1058`, [telefono-06](capturas/telefono-06-zones.png), [telefono-09](capturas/telefono-09-mapping.png) | Si el objeto mide menos de 3 asas, dibujarlas por fuera y dejar sólo 4 esquinas; zona de impacto de 44 px con dibujo de 10–12 px; lupa al arrastrar. |
| I3 | **`Corners` no tiene mando para la tablet**: los cuatro puntos se arrastran en el lienzo o se teclean (`Top-left x y`…). La cruceta de 1/5/20 px sólo existe en `Grid`. Es el ajuste que se hace de pie frente a la pared. | Medio | `views.js:214-217` frente a `views.js:244-266` | Cruceta común para `Corners` y `Grid`, con selección de esquina `◀ ▶`. |
| I4 | **Zonas: faltan los atajos de productividad** previstos: `Define by touch` (tocar dos esquinas en la pared), `Copy to walls…`, `Align`. El inspector sigue pidiendo `x0 y0 x1 y1`. No hay comportamientos (`Toggle`, `Counter`). | Medio | `views.js:736-770`, `PROPUESTA-UX.md §3.8` | Fase C. Mientras tanto, etiquetas `Left / Bottom / Right / Top` y tamaño `W × H`. |
| I5 | **Borrados sin confirmación y sin «Undo» a la vista**: `Delete zone`, `Delete mask`, `Delete` (salida). Se pueden deshacer con Ctrl+Z, pero en la tablet el botón `↶` es el único camino y nada lo señala. | Bajo | `views.js:769,731,823` | Aviso «Zone deleted · Undo» durante 8 s. |
| I6 | **Añadir muro** copia el `pixelRect` del último desplazado, pudiendo quedar fuera del lienzo o solapado, sin aviso; el ancho del lienzo no crece. | Medio | `views.js:133-142` | En tira, ampliar el lienzo y colocar a continuación; aviso `Overlaps Wx` / `Outside canvas` en `Mapping`. |
| I7 | **Los ids de muro no se pueden editar** (`W1…` en salas nuevas) y forman parte de la dirección OSC (`/vt/wall/<id>/…`). | Medio | `views.js:150-165`, `docs/OSC.md` | Campo `Id` en el asistente y en `Room`, con aviso de que cambia las direcciones de salida. |
| I8 | **`Virtual hand` aparece deshabilitada en `Show`** por CSS, aunque el motor la permite y la arquitectura dice que sigue funcionando. | Bajo | `app.css:125`, `app.js:368`, [16](capturas/16-show-locked.png) | Excluir `.tool` de mano del atenuado. |

### 3.5 Calibración

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| K1 | **Aciertos**: lista previa, anillo de progreso, orden en serpentina, captura por mediana, sensor que no ve una diana no bloquea, `Redo worst point`, `Verify` con 5 puntos nuevos midiendo el toque rastreado, modo foco automático en táctil, dianas grandes y «respirando» en la pared. | — | `calibration.js`, `projection.js:104-127`, [extra-08](capturas/extra-08-verify-result.png) | Conservar. |
| K2 | **Sin vía rápida.** Sólo existe la rejilla (2–5 × 2–4). No hay `Quick` (pose, 3–4 toques) ni la calibración de 4 esquinas que la referencia resuelve en un minuto. | Alto | `views.js:577-584`, `ANALISIS-LIDAR-UI.md §6.4` | Tres sesiones: `Quick` (4 toques, ajuste rígido) · `Standard` (3×3) · `Fine`. Por defecto: `Auto-align` → `Verify`; si falla, `Quick`. |
| K3 | **No dice por qué no captura.** `dets.length !== 1` descarta el candidato; el estado de la sesión no lleva motivo. En pantalla sigue «Touch and hold…». | Alto | `calibration.js:54,159-167` | `snapshot.reason`: `none` / `multiple` / `large`; texto en la pared y en la tablet («Only one hand on the wall», «Step back — body too close», «Not seen — hand flat on the wall»). |
| K4 | **Sin canal no visual**: ni sonido, ni vibración, ni bloqueo de reposo de pantalla. El operador mira la pared, no la tablet. | Alto | sin `AudioContext`/`vibrate`/`wakeLock` en `ui/` | Tres señales WebAudio (captura, problema, fin), `navigator.vibrate` donde exista, vídeo mudo en bucle como sustituto de Wake Lock por HTTP. |
| K5 | **Controles de la sesión**: `← Back`, `Skip target` y `Cancel` juntos y centrados, `Cancel` (destructivo, sin confirmación) a 8 px de `Skip target`; en modo foco quedan a media pantalla y el tercio inferior vacío. | Alto | `views.js:651-654`, `app.css:116`, [telefono-05](capturas/telefono-05-calibrate-session.png), [extra-11](capturas/extra-11-tablet-landscape-calibrate-session.png) | Fila inferior (zona del pulgar) con `Undo last` y `Skip` de 64 px; `Cancel` arriba a la derecha con confirmación. |
| K6 | **El resultado es una tabla.** No se ve dónde está el error; el peor punto no se resalta en el lienzo; no hay veredicto (16,6 mm RMS / 41,4 mm peor sale en el mismo gris que un resultado excelente). El texto dice «redo it with "Back"» cuando el botón correcto es `Redo worst point (#5)`. | Medio | `views.js:623-638`, [extra-07](capturas/extra-07-calibrate-result.png) | Vectores de residuo ×10 en el lienzo y en la pared, peor punto en ámbar, veredicto por umbral (≤ 10 excelente, ≤ 20 aceptable **[hardware]**), corregir el texto. |
| K7 | **Comprobación de proyección engañosa.** Con pantallas disponibles, `Open` pone `projection.open = true` y la marca pasa a ✓ aunque no haya pantalla elegida (no se crea ventana). Sin Electron, la marca sale ✓ siempre. El servidor sabe qué clientes tienen `role=projection` y no lo usa. | Alto | `views.js:575-576`, `app/main.js:120-123`, `server.js:155,188`, [extra-05](capturas/extra-05-calibrate-not-ready.png) | ✓ sólo si hay un cliente de proyección conectado; selector de pantalla en la propia lista previa. |
| K8 | **No encadena.** Tras `Apply & save` o `Done` vuelve a la lista previa del mismo muro. Con 4 muros, el operador navega 8 veces. El resultado de `Verify` no se guarda. | Medio | `views.js:596-607,634` | Botones `Verify P2 now` → `Next: P3`; guardar `{at, meanMm, maxMm}` por muro y mostrarlo en la lista, en el rail y en `Health`. |
| K9 | **El simulador estorba al aprender y demostrar la calibración**: las manos errantes siguen en el muro y son capturadas («Hold still…» sin tocar nada). | Medio | [07](capturas/07-calibrate-session.png), `engine.js:582-597` | Pausar las errantes del muro en calibración/verificación. |
| K10 | **Sin pausa ni caducidad**: una sesión abandonada queda abierta y bloquea la edición en los demás dispositivos hasta `Take control`. | Bajo | `engine.js:652-656` | Pausa automática a los 60 s sin toques; cierre con aviso a los 10 min. |
| K11 | **Fondo por muro desde `Calibrate` (bien) pero no por sala**; `Capture` no aparece en `Health` aunque sea el aviso más frecuente. | Medio | `views.js:573-574`, `views.js:84` | `Capture background — all sensors` en `Sensors`, `Calibrate` y `Health`. |

### 3.6 Visibilidad y descubribilidad

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| V1 | **Funciones valiosas que hay que saber que existen**: `Auto-align (room empty)` y `Level check` (botones pequeños en mitad del inspector), `Verify` (bajo «Current calibration»), `Versions`, `Recordings`/`Play` (ensayar sin hardware), `Fire (test)`, `Focus mode`, `Content underlay` (en `Mapping`, aunque se usa en `Zones`), `Inside` (3D), «moving» para identificar sensores. | Alto | `views.js:506,535,592`, [05](capturas/05-sensors.png), [06](capturas/06-calibrate-checklist.png) | Subirlas a la barra del lienzo o a la tarjeta «Next step» del paso al que pertenecen. |
| V2 | **La ayuda del lienzo es una línea de 11 px en `--ink-3`** abajo a la izquierda, oculta en ≤ 900 px. En la tablet no hay ninguna ayuda de herramienta. | Medio | `app.css:101,136`, `app.js:164-177` | Llevar la instrucción activa a la barra contextual (texto junto a la herramienta) y mantenerla en táctil. |
| V3 | **Primer arranque sin bienvenida**: abre una sala de demostración con manos errantes. Útil para explorar, pero no hay «New room» ni «Connect sensors» a la vista. | Medio | [extra-00](capturas/extra-00-first-launch.png) (primer arranque con carpeta de datos nueva) | Tarjeta de bienvenida en `Live` mientras la sala activa sea la simulada: `Set up a new room` · `Explore the demo`. |
| V4 | **`Health` informa pero no conduce**: «S2: no background captured», «S1 (W1): offline — no answer (0x6) from 192.168.11.11:8089». Sin botón, sin traducir el código. | Alto | `views.js:72-99`, [01](capturas/01-live-2d.png), [extra-02](capturas/extra-02-new-room-live-offline.png) | Cada línea con su acción (`Capture`, `Calibrate P2`, `Restart`, `Discover`); agrupar («3 sensors without background — Capture all»); texto llano para los errores del driver. |
| V5 | **`Discover` no diagnostica lo que puede saber**: si ninguna interfaz del PC está en 192.168.11.x, lo dice como consejo genérico, no como hecho. | Medio | `views.js:470`, `server.js:38-52` | Comprobar las interfaces y afirmarlo: «This computer has no address on 192.168.11.x (found: 172.17.1.51)». |
| V6 | **Atajos bien documentados** (`?`, hoja completa) pero sin equivalente táctil para `Duplicate` de máscara, `Esc`, ni cambio de muro `[ ]`. | Bajo | `app.js:341-358`, [15](capturas/15-shortcuts.png) | — |

### 3.7 Tablet en la sala

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| T1 | **Lo que funciona**: pestañas inferiores, modo foco de calibración a pantalla completa, QR con confirmación en vivo («Connected: …»), comprobación y arreglo del cortafuegos, nombre `.local`, detección del punto de acceso de Windows. | — | [telefono-05](capturas/telefono-05-calibrate-session.png), [13](capturas/13-connect-modal.png) | Conservar. |
| T2 | **Tablet apaisada = escritorio con controles grandes**: panel fijo de 400 px, barra en tres filas, lienzo reducido. (Era T11.) | Medio | `app.css:23-24,217`, [extra-10](capturas/extra-10-tablet-landscape-zones.png) | Con puntero grueso y ≥ 900 px: inspector como cajón plegable; barra en una fila con scroll. |
| T3 | **Objetivos táctiles por debajo de 44 px**: controles 38 px, `.btn.small` 34 px, botones `−/+` 38 px, interruptor 42 × 24. | Medio | `app.css:24,72,86` | `--ctl-h: 44px` en táctil; `.btn.small` con zona de 44 px. |
| T4 | **Modo foco sin el muro**: en táctil el panel cubre el lienzo y queda sólo un minimapa de 300 px. No se ve dónde cree el sensor que está la mano, que es el dato que explica una captura fallida. | Medio | `app.css:111`, `views.js:659-669` | Minimapa con el toque en vivo y el motivo (K3). |
| T5 | **Sin clave no hay diagnóstico** (ver día 2). Sin código de 6 dígitos, el acceso directo de iPadOS (almacenamiento separado) arranca sin emparejar. Sin `manifest` ni metaetiquetas de Apple. | Alto | `conn.js:22-28,64-70`, `index.html:3-10`, `PROPUESTA-UX.md §5.3` | Pantalla `Pair this device` + código; `manifest` e iconos. |
| T6 | **En ≤ 900 px desaparecen** `Connect device` y `Off / Identify / Debug` de la barra superior; quedan sólo en `System`. La tablet es justo donde se quiere encender el patrón. | Bajo | `app.css:224,235` | Botón `Pattern` en la barra del lienzo de `Mapping`, `Calibrate` y `Live`. |
| T7 | **Deslumbramiento**: botón primario blanco a todo el ancho (`Start calibration of P1`), QR sobre blanco. No existe modo `Dim`. | Bajo **[hardware]** | `app.css:68`, [telefono-08](capturas/telefono-08-system.png) | Primario en contorno al entrar en `Calibrate` con puntero grueso. |

### 3.8 Operación diaria y salud

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| D1 | `Show` bloquea `Verify` y `Capture background`; no hay `Mute outputs`. | Alto | `engine.js:659-663`; sin `mute` en `engine/` | Ver C8; comando `outputs.mute`. |
| D2 | **No hay detección de sensor desplazado ni de fondo obsoleto** en segundo plano; sólo dentro de `Level check`. | Alto **[hardware]** | `engine.js:426-434` | Comprobación periódica con la sala en reposo (sin toques durante N s) → aviso en `Health`. |
| D3 | **Sin historial de incidencias**: `Health` es instantáneo; el registro está al fondo de `System` en monoespaciada de 10,5 px. | Medio | `views.js:72-99,979` | Lista «21:14–21:15 S3 offline, recovered» en `Live`. |
| D4 | **`Send test` no prueba lo que el receptor consume** (`/vt/test`; en TUIO, un `alive` vacío; en textura, nada). UDP no confirma recepción y la interfaz no lo dice. | Medio | `outputs.js:271-279`, `views.js:822` | `Test touch` (toque sintético 5 s en círculo, marcado como prueba) y estado «Sending (no confirmation)». |
| D5 | **Salida TUIO: el inspector no se abre.** `on` se usa fuera de su función (`ReferenceError: on is not defined`); al seleccionar o añadir una salida TUIO el panel no cambia. | Crítico | `views.js:816`, [extra-09](capturas/extra-09-outputs-tuio-no-editor.png) | Corregir y cubrir con prueba que renderice el inspector de cada tipo de salida. |
| D6 | **`System › Room profiles`: los nombres no caben** junto a 4–5 botones; las salas inactivas muestran sólo «!» o nada. Se carga, exporta o borra una sala sin poder leer cuál es (el diálogo de borrado sí la nombra). | Alto | `views.js:959-965`, [extra-06](capturas/extra-06-system-profiles-truncated.png) | Nombre en su propia línea; acciones debajo o en menú `⋯`. |

### 3.9 Versatilidad

| ID | Caso | Estado | Evidencia | Recomendación |
|---|---|---|---|---|
| R1 | 1 muro | Funciona; `Auto-align` conserva `x` si no ve paredes laterales («x from kept») — correcto pero poco visible. | `autoalign.js:91-96` | Decirlo en el resultado: «No side wall seen: X kept — measure it or use Quick calibration». |
| R2 | Sala en L / U | El motor lo admite (`turn`, `joinNext`); el asistente no (C6); la vista 3D sí la dibuja. | `profile.js:223-224` | Plantillas de forma. |
| R3 | Varios sensores por muro | El motor fusiona (< 8 cm) y la calibración ajusta una matriz por sensor; el asistente sólo ofrece `One S2E per wall`; `+ S2E` asigna siempre al primer muro; no hay vista de solape ni medida de discrepancia entre sensores. | `views.js:290,363-372`, `tracker.js` | Fase D: cobertura por sensor y error entre sensores en la zona común. |
| R4 | Muros de anchos distintos | Sólo tras el asistente, muro a muro. | `views.js:291` | Fila por muro en el asistente. |
| R5 | Contenido no rectangular / varias salidas | `Rect / Corners / Grid` y zonas de lienzo lo cubren bien. La ventana de proyección sólo ocupa un monitor. | `app/main.js:125-128` | Ventana sobre varios monitores o límites personalizados. |
| R6 | Contenido desde otra máquina | Sin fuente alternativa de dianas (C7); Spout es local. | — | C7. |
| R7 | Superficies que no son un muro con suelo (suelo interactivo, mesa, pantalla LED sin suelo debajo) | `Auto-align` y `Level check` suponen suelo y paredes vecinas; el vocabulario es «wall». | `autoalign.js:69-70`, `levelcheck.js` | Fase D: generalizar a «surface». No urgente. |
| R8 | Nada específico de XR Lab en el código | Cumplido salvo ejemplos en textos («e.g. Barcelona XR Lab is 7196 × 912») y la sala simulada como arranque. | `views.js:297` | Aceptable. |

### 3.10 Calidad visual y textos

| ID | Hallazgo | Sev. | Evidencia | Recomendación |
|---|---|---|---|---|
| X1 | **Coherencia con VEATION: buena.** Tres superficies neutras, tinta `#E0E0E0/#B8B8B8`, cian = vivo, ámbar = atención, Geist, densidad de escritorio correcta. | — | `app.css:11-21` | Conservar. |
| X2 | **Rojo usado para lo que no es un fallo**: las máscaras se pintan en `--danger` rayado. Compite con sensor caído y objeto rechazado. (Era T13.) | Bajo | `workspace.js:861-866` | Rayado neutro (`--ink-dim`). |
| X3 | **Jerarquía plana en el inspector**: todas las secciones pesan igual; las acciones primarias son `btn small`; mucho párrafo explicativo permanente en `--ink-3` que empuja los controles (cada sección abre con 2–3 líneas de texto). | Medio | [05](capturas/05-sensors.png), [08](capturas/08-zones-wall.png), [12](capturas/12-system.png) | Una acción primaria por sección; explicaciones tras un `?` o visibles sólo en estado vacío. |
| X4 | **Estado `Status` del sensor**: tabla de 11 filas con el mismo peso (serie y firmware igual que «Data age» y «Restarts»). | Medio | `views.js:400-412` | Cuatro lecturas grandes (`Data`, `Rate`, `Restarts`, `Background`) y el resto plegado. |
| X5 | **Jerga**: «pose», «cal», «wall UV», «Scan plane», «Contact correction», «Smoothing (speed β)», «(0x6)», «homography». | Medio | [05](capturas/05-sensors.png), [10](capturas/10-outputs.png), [extra-07](capturas/extra-07-calibrate-result.png) | «position only» / «calibrated»; «0–1 per wall»; ocultar el tipo de ajuste salvo en detalles; `Processing` con presets (`Hands on wall`, `Bodies`) y `Reset`. |
| X6 | **Textos incorrectos o sobrantes**: «null» en `Discover`; «Pick the network … (above)» sin selector; «redo it with "Back"»; ayuda de `Calibrate` («Amber target = the one to touch now») visible sin sesión; nombre de sala cortado en el teléfono («Barcelona») sin forma de leerlo. | Medio | `views.js:471,1109,632`, `app.js:172` | Corregir (fase A). |
| X7 | **Colores literales en JS** (`#E5B567`, `#7FC4A2`, `#4FC3E8`) en vez de leer los tokens. | Bajo | `views.js:664-676`, `projection.js:13` | Leer de CSS como ya hace `workspace.js:65`. |
| X8 | **Tipografía del lienzo de 10–11 px** fija, también en táctil (etiquetas de sensor, medidas, ids). | Bajo | `workspace.js:833,970,1026` | ≥ 12 px con puntero grueso. |

### 3.11 Propuesta de UX frente a lo construido

| Propuesto (`PROPUESTA-UX.md`) | Estado |
|---|---|
| Espacios de trabajo por herramienta, foco en un muro, navegador de muros, barra contextual, deshacer | **Hecho** |
| Rail de pasos con estado, `SETUP / SHOW` | **No** (sólo el candado `Show`) |
| Manipulación directa de zonas, máscaras, sensores; ajuste; duplicar | **Hecho** · lupa, guías de alineación, `Align`, `Copy to walls…`, `Define by touch`: **no** |
| Calibración en modo foco, `Redo worst point`, `Verify` | **Hecho** · motivos, sonido/vibración, mapa de error, `Quick/Standard/Fine`, `Top corners`, fuente de dianas, pausa, pausar simulador: **no** |
| Emparejamiento: selector de red, cortafuegos con arreglo, confirmación en vivo, `.local`, punto de acceso | **Hecho** · código de 6 dígitos, pantalla `Pair this device`, mensajes de conexión diferenciados, lista con `Remove`: **no** |
| `Mapping` `Rect / Corners / Grid`, fondo de contenido, patrón en la pared, cruceta | **Hecho** (cruceta sólo en `Grid`) · avisos de solape, `Layout…`, `Touch to pin`, vistas enlazadas: **no** |
| Salidas: `Triggers`, textura Spout | **Hecho, y más** (Webhook, Art-Net, sACN) · monitor de señal, `Test touch`, alta por uso, `Receiver confirmed`, `Mute all`, NDI: **no** |
| Sensores: descubrimiento, `Auto-align`, `Level check`, «moving» | **Hecho** · bloque de salud, `Sensor view`, máscaras sugeridas, comprobación de la red del PC: **no** |
| `Live`: `Health`, `Show lock` | **Hecho** · franja de salud, incidencias, controles de emergencia, pulsación mantenida para desbloquear: **no** |
| Zonas poligonales, circulares y de lienzo entre muros; `Min hands`; `Fire` | **Hecho** (adelantado) · comportamientos `Toggle/Counter`: **no** |
| Asistente `New room` de 7 pantallas con plantillas | **Parcial**: 1 pantalla, sin plantillas |
| Versiones, grabación y reproducción, control exclusivo de sesión, hoja de atajos, vista 3D | **Hecho** |
| Pose rígida separada del mapeo | **No** |
| `manifest`/acceso directo, modo `Dim`, zurdo/diestro, 44 px | **No** |

---

## 4. Plan de ajustes por fases

Esfuerzo: **S** ≤ ½ día · **M** 1–2 días · **L** 3–5 días. «HW» = necesita sensores reales para darse por cerrado.
Regla de la casa: cada cambio de comportamiento lleva su prueba en `tests/` y la prueba debe saber fallar.

### Fase A — inmediata (≤ 1 día en total): defectos y quick wins

| # | Qué cambiar exactamente | Resuelve | Esf. | HW | Cómo se verifica |
|---|---|---|---|---|---|
| A1 | `views.js:816`: calcular la pista del interruptor `One port per wall` con `o.tuioPortPerWall`, no con `on`. | D5 | S | No | Prueba que renderiza `outputs()` con una salida de cada tipo seleccionada (falla hoy con TUIO). |
| A2 | `discoverModal`: filtrar `null` antes de `replaceChildren`; mensaje con las interfaces reales del PC cuando ninguna está en la subred de fábrica. | X6, V5 | S | No | Captura del diálogo sin unidades: sin «null»; prueba de la función de mensaje. |
| A3 | `System › Room profiles`: nombre e id en una línea propia; botones en una segunda fila. | D6 | S | No | Captura a 1440 y 390 px con nombres de 30 caracteres legibles. |
| A4 | Asistente: en `Continuous strip` sustituir `Canvas width (px)` por el valor calculado en vivo; al crear, ir a `Sensors` con un aviso «Room created — next: connect the sensors». `System › + New` abre el asistente. | 2 (recorrido), O4 | S | No | Crear sala con 3840 → el campo mostraba 7296 antes de crear; el aviso aparece. |
| A5 | Botón `Capture background — all sensors` (misma cuenta atrás) en la cabecera de `Sensors`, en la lista previa de `Calibrate` y en `Health`. Usa `bg.capture {}` existente. | 2 (top 10), K11 | S | No | Con la sala simulada: un clic deja los 4 sensores en «captured». |
| A6 | Reordenar el inspector del sensor: `Status` (resumido) → `Background` → `Mounting` → `Calibration` → red y modo de barrido plegados. | O2 | S | No | Captura; el flujo fondo → auto-alineado no requiere scroll a 900 px de alto. |
| A7 | Comprobación de proyección veraz: ✓ sólo si `clients` incluye un `role=projection`; selector `Projection on` dentro de la lista previa. | K7, 5 (top 10) | S | No | Prueba de `clientList` con rol; sin página de proyección la marca queda vacía. |
| A8 | `Health` con acciones: cada aviso lleva botón al remedio; agrupar avisos iguales; texto llano para `no answer (0x6)`. | V4 | S | No | Captura de sala nueva: «4 sensors offline — Discover». |
| A9 | Confirmar el cambio de sala del selector superior con su efecto; vaciar `Events` al cambiar de perfil. | O7, W7 | S | No | Prueba manual + captura. |
| A10 | Colisiones: ancho del muro en `Room` bajo el borde; omitir medidas que no caben en la tira; id del toque al lado; `ws-bar` reserva el ancho real de `stage-tools`. | W3, W4 | S | No | Capturas 03, 08 y telefono-01 repetidas sin solapes; `Undo` visible en `Zones`. |
| A11 | Sesión de calibración: corregir «redo it with "Back"»; `Cancel` separado y con confirmación; unidades en `Lowest/Highest target (m)`; motivo real en `Start calibration` deshabilitado; quitar la ayuda «Amber target…» fuera de sesión. | K5, K6, W6, X6 | S | No | Capturas 06, 07 y extra-05 repetidas. |
| A12 | Pausar las manos errantes del muro en calibración o verificación. | K9 | S | No | Prueba: con `wanderers = 3`, la sesión no pasa a `holding` sin `sim.touch`. |
| A13 | Página sin clave: si `/ws/ui` responde 401, mostrar «This device is not paired — scan the QR on the server again» en vez de «Reconnecting…». | T5, día 2 | S | No | Abrir la UI por IP de LAN sin `?k=` → mensaje nuevo. |
| A14 | Texto «Pick the network…» sólo si hay más de una red; `Virtual hand` activa en `Show`; un solo nombre (`Pattern`) para `Identify`. | X6, I8, O5 | S | No | Capturas 13 y 16. |

### Fase B — corta (1–3 días por bloque): camino guiado y calibración en tablet

| # | Qué cambiar exactamente | Resuelve | Esf. | HW | Cómo se verifica |
|---|---|---|---|---|---|
| B1 | **Rail con estado y «Next step».** Función pura `setupStatus(state, status)` → por herramienta `{done, issues[], next}`; insignias en el rail; tarjeta en el inspector sin selección; separadores de grupo. | O1, V1, 1 (top 10) | M | No | Pruebas de `setupStatus` (sala vacía, sin fondo, sin verificar, lista); recorrido de sala nueva sin leer el manual. |
| B2 | **`Prepare all sensors`**: un diálogo que encadena cuenta atrás → fondo de todos → `Auto-align` de todos → tabla de propuestas (pose, ancho medido frente a planos) con `Apply all` → `Level check` de todos con resumen. | O2, 2 (top 10) | M | Sí (umbrales) | Simulador con poses desplazadas: un flujo deja los 4 sensores alineados; prueba del motor para la orden por lotes. |
| B3 | **Asistente v2** (4–5 pantallas): forma (`Single wall / Corner / U / Box / Custom`) → fila por muro (id, nombre, ancho, alto, esquina continua) → lienzo y reparto con vista previa → sensores (`Discover now` / simulados / después) → pantalla de proyección y destino de salida por uso. | C6, I7, R2, R4, 7 (top 10) | M | No | Crear XR Lab desde cero en < 2 min sin tocar `Room` después; prueba del generador de perfil por plantilla. |
| B4 | **Sesión con realimentación**: `reason` y recuento por sensor en `snapshot`; textos en pared y tablet; sonido, vibración y pantalla encendida; fila inferior de 64 px; minimapa con el toque en vivo. | K3, K4, K5, T4, 8 (top 10) | M | Sí (umbrales, audibilidad) | Pruebas de `CalibrationSession` con 0, 2 detecciones y objeto grande; sesión en tablet real a oscuras. |
| B5 | **Resultado como mapa de error** en lienzo y pared; veredicto por umbral; `Verify now` y `Next: Px`; guardar la última verificación por muro y mostrarla en `Calibrate`, rail y `Health`. | K6, K8, C2 | M | Sí (umbrales) | Diana desplazada 6 cm en simulación → vector visible en #5 y veredicto «redo». |
| B6 | **`Show` operable**: permitir `verify.start`, `bg.capture` (con confirmación) y reinicio de sensor; comando `outputs.mute`; fila de emergencia en `Live`; desbloqueo con pulsación de 1 s. | C8, D1, 9 (top 10) | M | No | Pruebas del motor: en `locked` pasan esas órdenes y se rechaza `profile.update`; con `mute` no sale ningún paquete. |
| B7 | **Salidas que se pueden probar**: `Test touch` (5 s, marcado `test`), monitor de los últimos mensajes del destino seleccionado en el lienzo de `Outputs`, IP de LAN en la URL de WebSocket, alta por uso (`TouchDesigner — data`, `Resolume — triggers`…), estado «Sending (no confirmation)». | W2, D4 | M | No | Receptor OSC de prueba en `tests/` recibe el círculo; captura del monitor. |
| B8 | **Tablet**: `--ctl-h: 44px`; inspector como cajón con puntero grueso ≥ 900 px; barra en una fila; asas exteriores en objetos pequeños; cruceta también en `Corners`; lienzo oculto en `System`. | T2, T3, I2, I3, W2 | M | Sí (tablet real) | Capturas 1180×820 y 820×1180; prueba de impacto de asas. |
| B9 | **Código de 6 dígitos** y pantalla `Pair this device`; `manifest` e iconos. | T5 | M | Sí (iPad/Android) | Emparejar un iPad desde el acceso directo de la pantalla de inicio. |

### Fase C — media (1–2 semanas): modelo de calibración, esquinas y productividad

| # | Qué cambiar exactamente | Resuelve | Esf. | HW | Cómo se verifica |
|---|---|---|---|---|---|
| C1 | **Vía rápida de calibración**: nivel por defecto `Auto-align → Verify`; sesión `Quick` (4 toques, ajuste rígido o de similitud, `kind: 'rigid'`); `Standard` y `Fine` como refinamiento; elección del modelo por error dejando-uno-fuera. | C2, C4, K2, 3 (top 10) | L | **Sí** (decide el modelo) | Pruebas de ajuste con ruido sintético y dianas sólo en la franja baja: error en y = 3,2 m del modelo rígido frente a la homografía; sesión real en XR Lab. |
| C2 | **`Corner check`**: paso de verificación por cada esquina continua (id único, salto en la costura en mm y px, tiempo ciego); dianas opcionales a 25 cm de cada borde. | C5, 4 (top 10) | M | **Sí** | Simulación con poses discordantes entre muros vecinos → el salto se informa; prueba en sala. |
| C3 | **Calibración ligada al mapeo**: huella del mapeo en `sensor.calibration`; aviso si cambia; paso `Top corners` con la cruceta. | C3 | M | Parcial | Prueba: cambiar `pixelRect` tras calibrar → aviso en `Health`. |
| C4 | **Fuentes de dianas**: dianas dentro de la textura Spout y `Physical marks`. | C7, R6 | M–L | Parcial | Calibrar la sala simulada sin página de proyección. |
| C5 | **Ventana de proyección sobre varios monitores** o límites personalizados. | R5 | M | Sí (multipantalla) | Dos monitores: el patrón cubre ambos. |
| C6 | **Zonas**: `Define by touch`, `Copy to walls…`, `Align`, comportamientos `Toggle`/`Counter` (aditivos al contrato de `docs/OSC.md`). | I4 | M | No | Pruebas de `zones.js` para los comportamientos; dos toques simulados crean la zona. |
| C7 | **Vigilancia de fondo y máscaras sugeridas**: comprobación en reposo; propuesta de máscara donde hay primer plano persistente. | D2 | M | **Sí** | Mover la pose del sensor simulado → aviso en < 30 s sin falsos positivos con manos errantes. |
| C8 | **Salud y ajuste**: incidencias con historial en `Live`; bloque de salud del sensor; `Processing` con presets y `Reset`; vista `Canvas` en `Live`; `2D | 3D` en `Room`. | D3, X4, X5, W1, O6 | M | No | Capturas; prueba del registro de incidencias. |

### Fase D — larga / estructural

| # | Qué cambiar | Resuelve | Esf. | HW | Cómo se verifica |
|---|---|---|---|---|---|
| D1 | **`SETUP / SHOW` como modos de la aplicación y papel por dispositivo** (la tablet de sala arranca en `SHOW` como mando: `Live`, `Verify`, cruceta, prueba de zonas); quiosco; HTTPS con autoridad local si se fija un parque de tablets. | C8, T5 | L | Sí | Jornada completa de operación con una tablet dedicada. |
| D2 | **Editor de sala en planta** unificado con la vista 3D (muros como segmentos, ángulos, plantillas, desde un plano); 3D también en `Sensors`. | O6, R2 | L | No | Crear una sala en L y una en U sin teclear ángulos. |
| D3 | **Varios sensores por muro**: cobertura de cada uno, discrepancia en la zona común, identificación guiada («wave at W1»). | R3 | L | **Sí** | Muro con dos S2E: error entre sensores < umbral tras calibrar. |
| D4 | **Direccionamiento de IP dentro de la app** (asistente «connect one new sensor» con `setStaticIp` validado). | 4 (recorrido) | M | **Sí** | Cuatro S2E de fábrica direccionados sin RoboStudio. |
| D5 | **Integración**: confirmación del receptor (`/vt/pong`), componente `.tox` y ejemplo descargable, salida compatible con lidar-ui, NDI (previa decisión de licencia). | D4 | L | No | El ejemplo de TouchDesigner pasa a `Receiver confirmed`. |
| D6 | **Guía integrada** (recorrido sobre la interfaz real) e **informe de sala** exportable (calibración, verificación, esquinas, fecha). | V1, V3 | M | No | Operador nuevo completa una sala simulada sin manual. |
| D7 | **Superficies genéricas** (suelo, mesa, LED sin suelo). | R7 | L | Sí | — |

**Orden recomendado si hay que recortar:** A completa → B1 → B2 → B4 → B6 → C1 + C2 (con hardware) → B3 → B5 → B7 → B8 → B9 → resto.

---

## 5. Qué está bien y conviene no tocar

- **El modelo sala → muro (m) → lienzo (px) → salidas**, con perfiles por sala, escritura atómica, 30 versiones y un
  único punto de normalización. Es la ventaja estructural frente a la referencia.
- **El motor como dueño del servidor**: la tablet sigue funcionando sin la ventana del escritorio; supervisor con
  reinicio; edición optimista con revisiones.
- **La gramática de manipulación directa** del lienzo: arrastrar, asas, ajuste, empujones, vista previa local y un único
  envío al soltar; deshacer con nombre de acción (`Undo delete zone`).
- **Esquinas continuas** como capa sobre los rastreadores por muro (un `down`, un `cross`, un `up`), su dibujo en la tira
  («↻», muros que se tocan) y la vista 3D con el contenido y las zonas.
- **`Verify`** como medida de extremo a extremo (lo que envían las salidas), con el error en mm sobre el lienzo y en la
  pared ([extra-08](capturas/extra-08-verify-result.png)). Es la pieza sobre la que debe pivotar la vía rápida.
- **`Auto-align`** (con el ancho medido frente a los planos y `Use … m as wall width`) y **`Level check`** (marcas rojas,
  consejo en palabras, aviso de fondo obsoleto). Sólo les falta visibilidad y ejecución por lotes.
- **Lista previa de `Calibrate`**, cuenta atrás de 5 s del fondo con detección de movimiento y su posición, dianas en
  serpentina, `Redo worst point`.
- **Control exclusivo de la sesión** con `Take control` y relevo automático.
- **Emparejamiento que se diagnostica**: QR, confirmación en vivo, cortafuegos con `Fix (administrator)`, `.local`,
  detección del punto de acceso y de la red de sensores.
- **Zonas en dos espacios** (`Wall` en metros, `Canvas` en píxeles sobre el contenido) con rectángulo, polígono y círculo,
  `Min hands` y `Fire (test)`; las zonas de lienzo dibujadas discontinuas en cada muro que alcanzan.
- **`Mapping` en tres niveles** (`Rect → Corners → Grid`) con la frase «It changes where touches land in canvas
  coordinates, never the image», y el fondo de contenido.
- **Salidas**: variedad (OSC, Triggers, TUIO, WebSocket + SDK, Spout, Webhook, Art-Net, sACN), contrato publicado en
  `docs/OSC.md`, direcciones visibles en el inspector de la zona.
- **Simulador, grabación y reproducción**: permiten diseñar, ensayar y depurar sin hardware. Imprescindibles.
- **Sistema visual**: tokens de VEATION, dos acentos con significado, Geist, densidad de escritorio; pestañas
  inferiores en pantallas estrechas; hoja de atajos (`?`).
- **`Show`** como candado único y visible (ámbar, «Show · locked»), y la confirmación al desbloquear.

---

## Estado de la fase A (aplicada el 2026-11-16)

Hecha completa. Cada cambio lleva su prueba; las de interfaz se ejecutan en la interfaz real (ventana oculta de
Electron, `tests/ui.test.mjs`) y fallan sin el arreglo.

| # | Resultado |
|---|---|
| A1 | El inspector de la salida TUIO se abre; prueba que abre el de cada tipo de salida. |
| A2 | `Discover` sin «null» y con el diagnóstico real: «This computer has no address on 192.168.11.x (it has: …)». |
| A3 | `System › Room profiles`: nombre en su línea, acciones debajo (`Delete` con texto). |
| A4 | Asistente: en tira el ancho del lienzo se calcula y se muestra (sólo lectura); al crear lleva a `Sensors` con el paso siguiente; `System › + New` abre el mismo asistente. |
| A5 | `Capture background — all sensors` en `Sensors` (con recuento), en la lista previa de `Calibrate` (`All walls`) y en `Health` (`Capture all`). |
| A6 | Inspector del sensor en orden de uso: estado → fondo → montaje → calibración; red y detalles plegados (recuerdan si están abiertos). |
| A7 | La marca de proyección sólo es ✓ con una página de proyección conectada; selector de pantalla en la propia lista. |
| A8 | `Health` agrupa los avisos, los dice en llano y ofrece el botón que los resuelve. |
| A9 | Cambiar de sala (barra superior o `Load`) pide confirmación con lo que detiene; se vacían los eventos de la sala anterior. |
| A10 | La barra de herramientas no tapa `Undo`; etiquetas de muro, zona y toque sin solapes (también en el teléfono); tiradores de `Room` proporcionados. |
| A11 | Sesión de calibración: `Cancel calibration…` aparte y con confirmación; unidades en las alturas; motivo real si no se puede empezar; texto de `Redo worst point` corregido; ayuda de dianas sólo durante la sesión. |
| A12 | Las manos simuladas se apartan del muro que se calibra o verifica. |
| A13 | Una tablet sin clave ve «This device is not paired» con la instrucción, en vez de «Reconnecting…» sin fin. |
| A14 | «Pick the network…» sólo con varias redes; en `Show` siguen la vista y `Virtual hand`; un solo nombre, `Pattern`. |
