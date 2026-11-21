# VEATION Touch como media server — plan de construcción

> **Tipo:** plan de construcción (análisis + arquitectura + fases). **Fecha:** 2026-11-21. **Estado:** propuesta, sin código.
> **Encargo de Beltrán:** que VEATION Touch sea también el media server de la sala (rejilla de clips y Advanced Output
> al estilo de Resolume Arena), que reproduzca HAP con su audio por los altavoces de la sala, que tenga una experiencia
> «Reel» interactiva, que el teléfono controle la sala y que todo sea muy intuitivo.
>
> **Qué está comprobado y qué no.** Este análisis sólo leyó código y documentación (este repo, `Immersive Studio Pro`,
> la web de Alma Digital) y buscó en la web. **No se ejecutó nada**: ni Electron, ni pruebas, ni GPU (el PC está
> compartido con otro equipo). Las cifras marcadas «medido en VEATION» vienen de `docs/PROXY-LIVE.md` de ese repo (RTX
> 4060 de portátil, 4096²). Las marcadas «estimado» son cuentas hechas aquí y **hay que medirlas en la fase F0**.

---

## 1. Resumen y decisiones clave

VEATION Touch pasa de «rastreo táctil + una experiencia por Spout hacia Resolume» a **servidor completo de la sala**: un
solo PC compone experiencia + clips + máscara de toques + rejilla de calibración y lo entrega ya mapeado a los
proyectores. Nada de esto rompe lo que hay: la salida Spout «VEATION Touch» sigue existiendo para salas que tengan otro
media server.

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Un mezclador en GPU (WebGL2) dentro de la página de salida** sustituye al apilado de elementos DOM de `ui/js/output.js`. Todas las capas son texturas; se componen en un FBO del tamaño del lienzo de contenido (7196×912). | El Advanced Output necesita **muestrear** la imagen compuesta para recortar slices; el DOM no se puede volver a muestrear. Con un solo camino para Spout y para pantallas hay la mitad de fallos. |
| D2 | **La ventana visible es la que renderiza** (destino nuevo `sink: 'screens'`): una ventana sin marco sobre la pantalla (o sobre el rectángulo que cubre varias), con `requestAnimationFrame` enganchado al vsync. | La fluidez del vídeo es la prioridad. La alternativa (ventana fuera de pantalla → textura compartida → segunda ventana) añade un fotograma de retraso y un ritmo de fotogramas no ligado al vsync. Queda como plan B (§9, R2). |
| D3 | **HAP con el decodificador propio de VEATION**, portado: `hap-worker.js` (índice del `.mov`, Snappy en JS, subida comprimida S3TC en el contexto WebGL del worker, `ImageBitmap` al hilo principal) y la lógica del planificador `driveHAP`. | Está construido, medido y revisado tres veces (R400, R401, R409). Cumple la regla de licencias: código propio, cero dependencias, sin FFmpeg. 7196×912 es 2,5 veces más ligero que el 4096² que VEATION ya reproduce a 60 fps. |
| D4 | **WebGL2 y no WebGPU** para el mezclador y los workers. | El worker portado es WebGL2 y su copia `ImageBitmap` → textura está medida (0,1 ms). VEATION midió WebGPU `writeTexture` y no ganaba (11,5 ms frente a 10–15 ms): el techo es el proceso GPU de Chromium, no la API. `room3d.js` ya es WebGL2 propio. |
| D5 | **El reloj es el del motor**. El motor guarda «el clip X empezó en el instante T»; la página de salida y la de audio calculan su posición con ese reloj. No hay bucle de realimentación vídeo↔audio. | Es determinista y soporta recargas: una página que se reinicia recalcula dónde va y sigue en sincronía. Es el mismo patrón que ya usa `makeHands` (`live.t` + desfase estimado). |
| D6 | **El audio de los clips sale por el grafo de audio de sala existente** (`ui/js/audio-graph.js`), con un bus propio, un modelo de ruteo/upmix y corrección de deriva. El PCM lo sirve el motor por HTTP local en trozos. | Reutiliza dispositivos, mapa muro→canal, sub, master y limitador (`profile.audio`). No depende de que Chromium sepa abrir un `.mov` con PCM (no está garantizado). |
| D7 | **Los medios viven en una biblioteca fuera del repo** (carpeta elegida por máquina, `settings.mediaDir`) y **se copian siempre a ella al importar**. El show referencia rutas relativas a la biblioteca + huella. | Un lápiz USB típico lee a 30–150 MB/s y el reel pide 64–197 MB/s. Copiar hace el show portable y a prueba de «me llevé el USB». |
| D8 | **El show es un archivo aparte del perfil** (`shows/<id>.json`): decks, capas, clips, presets de experiencia. El perfil de sala sólo dice qué show usa y cómo sale (pantallas, audio). | «Nada de una sala concreta va en el código» y, del mismo modo, el contenido no debe ir pegado a una sala: el mismo show se abre en otra sala. Equivale a la composición de Resolume frente a su Advanced Output. |
| D9 | **Las experiencias pasan a ser presets que se cargan en Live** (estantería de tarjetas). Hay **una** capa de experiencia y **una** experiencia viva a la vez. | Una experiencia WebGPU a 7196×912 ya ocupa buena parte de la GPU; dos a la vez no caben con garantías. Una tarjeta = «qué sale»: experiencia + parámetros + pieza de sonido + clips asignados. |
| D10 | **Las experiencias lanzan clips por el runtime** (`vt.media.*`) sobre una capa reservada. Reel es el primer cliente, no un caso especial. | Petición expresa. La máquina de transporte es la misma que usa la rejilla. |
| D11 | **Advanced Output en dos etapas, como Resolume**: *Input* (qué trozo del lienzo es cada slice; por defecto el `pixelRect` del muro) y *Output* (dónde cae en cada pantalla: rect, corner pin o malla). Vive en `profile.output.screens`. | Los perfiles ya tienen la tira y el orden de muros (`walls[].pixelRect`). Se reutilizan `rect/corners/grid` y `geometry.js`; no se inventa otra geometría. |
| D12 | **Tres secciones de primer nivel: Live · Output · Setup.** Las 9 pestañas de hoy se reagrupan sin cambiar sus identificadores internos. | Petición expresa: ninguna pantalla sobrecargada. Mantener los `data-view` evita reescribir `tests/ui.test.mjs` (usa `__vt.go('<view>')` 27 veces). |
| D13 | **El teléfono pasa a ser el mando de la sala**: modo Live (lanzar, cargar preset, volumen, blackout) y modo Calibrate (el de hoy). Por el relé sólo viajan estado, órdenes y miniaturas. | Petición expresa. El relé limita los cuerpos a 4 MB y 8 sockets por sala (`cloud/relay/core.mjs`). |
| D14 | **Contrato público intacto** (`docs/OSC.md`): OSC/TUIO/WebSocket/Spout no cambian. `output.layers` gana una capa opcional `media`; los clientes que envían las tres de siempre siguen valiendo. | Cambiar esa API rompe proyectos de clientes. |
| D15 | **Sin dependencias nuevas.** Snappy, MOV, DXT, PNG (con `node:zlib`) y el reproductor son código propio. La fuente Raleway de la marca (SIL OFL, como Geist) se autoaloja sólo en la experiencia Reel. | Regla de licencias de `CLAUDE.md`. |
| D16 | **Primero se mide (F0), luego se construye el mezclador.** | Hay una incógnita que decide el diseño: el coste de copiar el lienzo de la experiencia (WebGPU) a una textura del mezclador a 7196×912 y 60 fps. |

**Lo que no entra en este plan:** efectos de vídeo, sincronía por BPM, MIDI, edge blending, máscaras de salida, entrada de
cámaras/NDI, edición de vídeo, generación de HAP (el usuario trae los HAP hechos).

---

## 2. Lo que se toma de Resolume Arena 7 y lo que no

Fuente: manual de Resolume (`resolume.com/support/en/…`: decks, clips, layers, 7/video, screens, input-selection,
output-transformation). Los nombres en cursiva son los de Resolume.

### 2.1 Rejilla y lanzamiento

| Resolume | En VEATION Touch | Notas |
|---|---|---|
| Capas = filas, columnas = «escenas», *decks* = páginas de la rejilla | **Se toma.** Capas (1–8, por defecto 3), columnas (crecen solas), decks como pestañas | El orden visual: la fila de arriba es la capa de delante, como la lista de capas de hoy (`views.js › experiences`) |
| Clic en la **miniatura** lanza; clic en el **nombre** sólo selecciona | **Se toma tal cual.** | Es lo que evita lanzamientos por error. Ableton hace lo mismo |
| Clic en la cabecera de columna lanza toda la columna | **Se toma.** | Es el «cambio de escena» de un clic |
| **X** a la izquierda de la capa expulsa su clip | **Se toma** (`layer.clear`, con la transición de la capa) | |
| *Ignore Column Trigger* por capa | **Se toma** (`layer.ignoreColumn`) | Para un fondo que sobrevive a los cambios de columna |
| *Trigger style*: Normal (relanza) / Toggle / Piano | **Normal y Toggle.** Piano no | Piano pide mantener pulsado: no tiene sentido en un teléfono |
| Opacidad, *blend*, *Bypass*, *Solo* por capa | **Opacidad, blend (normal/add/screen/multiply), Bypass.** Solo no | Los cuatro blends ya existen en `OUTPUT_BLENDS` |
| *Layer transition* (0–10 s, por defecto Alpha) | **Se toma: fundido cruzado 0–10 s por capa**, con anulación por clip | Sólo fundido; sin catálogo de transiciones |
| Valores heredados (*Layer Determined*) | **Se toma**: cada ajuste de clip puede ser «Layer default» | Un cambio en la capa afecta a todos sus clips |
| *Clip target*, grupos, *Beat Snap*, *Fader Start*, BPM Sync, efectos, dashboard | **No.** | No hacen falta en una sala con contenido prerrenderizado |

### 2.2 Transporte y final del clip

| Resolume | En VEATION Touch |
|---|---|
| *Loop* (por defecto) | `end: 'loop'` — por defecto para clips sin audio |
| *Play Once and Hold* | `end: 'hold'` — se queda en el último fotograma |
| *Play Once and Eject* | `end: 'clear'` — por defecto para clips **con** audio (un reel no debe repetirse solo) |
| *Ping Pong* (lo que el encargo llama «bounce») | `end: 'bounce'` — gratis en HAP (todo fotograma es clave); el audio sólo suena en la pasada hacia delante |
| *Auto Pilot*: next / previous / random / first / last / clip concreto, tras N *loops* | `end: 'next' \| 'prev' \| 'random' \| 'first'`, con `loops` (1–99). Sin «clip concreto» |
| *Autopilot Transition Compensation* (7.27): lanza el siguiente antes para que el fundido termine justo al acabar | **Se toma**: el motor programa el siguiente con antelación = duración del fundido |
| Puntos de entrada y salida (*in/out*) | `in`, `out` en segundos |
| *Playmode Away* (pick-up, relative), *Random* con intervalo, velocidad, *Duration*, dirección inversa | **No** en la primera versión |

Corrección de un bug conocido de Resolume (reconocido en su foro): «play once and hold» no se aplicaba a clips recién
importados. Aquí el clip recibe los valores por defecto de su capa **al crearse** y una prueba lo comprueba.

### 2.3 Advanced Output

| Resolume | En VEATION Touch |
|---|---|
| *Screens*: una por salida física; lista a la izquierda con sus *slices* | **Se toma.** `profile.output.screens[]`, cada una ligada a una pantalla del sistema |
| Etapa *Input Selection*: el slice es un rectángulo del lienzo; campos numéricos; flechas 1 px, Mayús 10 px | **Se toma.** Por defecto el slice sigue el `pixelRect` de su muro |
| Etapa *Output Transformation*: mover/escalar, *Edit Points* (4 esquinas, malla lineal), *flip* H/V | **Se toma**: `rect`, `corners`, `grid` (los modos de `wall.mapping`) y flips |
| *Show Test Card* | **Se toma**: carta de ajuste por pantalla |
| Presets en XML | **Dentro del perfil** (con sus 30 versiones) + exportar/importar JSON |
| Máscaras, slices poligonales, puntos Bézier, edge blending, color por pantalla, salidas virtuales, DMX/fixtures | **No.** Un proyector por muro, sin solapes. El edge blending queda anotado para una sala futura |

### 2.4 Audio de Resolume

Resolume da volumen y pan por clip y por capa, y en la práctica es estéreo → estéreo. Es una de las quejas de sus
usuarios. Aquí el ruteo multicanal es parte del producto (§4c).

---

## 2b. Estudio UX de media servers

Método: páginas oficiales de cada herramienta y algunos hilos de foros. Los foros dieron poco; donde pone «inferido»
es razonamiento propio, no una cita.

### 2b.1 Por qué funciona Resolume (y de qué se quejan)

**Lo que funciona:**
1. **La rejilla se entiende en diez segundos.** Filas = capas que se tapan, columnas = momentos. Lanzar una columna es
   cambiar de escena con un clic. A quien viene de Ableton Live le resulta natural.
2. **Seleccionar y lanzar son gestos distintos** (nombre frente a miniatura): se puede preparar un clip sin que salga.
3. **Lo destructivo está a la vista y en su sitio**: la X de expulsar, Bypass y Solo viven en la tira de la capa.
4. **Los valores se heredan hacia abajo** (composición → capa → clip): se configura una vez.
5. **Los decks mantienen la rejilla pequeña** aunque la biblioteca sea grande.
6. **El Advanced Output separa «qué cojo» de «dónde lo pongo»**, con lista de pantallas/slices a la izquierda, lienzo en
   el centro y números a la derecha. Cada etapa responde a una sola pregunta.
7. **Arrastrar y soltar en todas partes** (del explorador a la rejilla).

**Las quejas:**
1. Interfaz recargada: todo (efectos, dashboard, BPM, navegador) está siempre a la vista. Hay usuarios que piden una
   vista «sólo banco de clips».
2. El estado de reproducción se lee mal de lejos y los colores ayudan poco.
3. Audio limitado a estéreo.
4. Medios perdidos: *Collect Media* no siempre lo recoge todo y reubicar puede perder ajustes.
5. No hay edición en bloque ni forma de fijar clips al desplazarse.
6. El formato del Advanced Output no está documentado.

### 2b.2 Una idea de cada herramienta

| Herramienta | Su metáfora | Idea que se toma | Qué se evita |
|---|---|---|---|
| **Ableton Live (Session View)** | Rejilla de clips; una fila = escena | **Estado de reproducción por tipo**: un clip en bucle enseña un círculo que se llena; uno de una sola pasada, una barra con el **tiempo que queda**. Botón de parar por pista. *Follow actions* marcadas en el propio clip | Las reglas sutiles (cuantización aplicada a todo) |
| **Millumin** | Columnas = «momentos del show» | **«Siguiente columna»** como acción única (ideal para el teléfono). **Lo que está en vivo se resalta en un color**, y lo que se edita no toca la salida | No tiene mando propio: depende de TouchOSC |
| **MadMapper** | Entrada y salida lado a lado | **Ver a la vez el lienzo de entrada y la pantalla de salida**; al pasar el ratón por un slice se ilumina en las dos | La profundidad escondida tras una interfaz mínima |
| **VDMX** | Ventanas modulares | **Punto de «listo»** en el clip ya precargado | La modularidad total: curva de aprendizaje |
| **QLab** | Lista de cues + botón GO | **Un indicador global de problemas** (archivo que falta, salida de audio sin dispositivo) que abre la lista y ofrece buscar en una carpeta. **El proyecto es una carpeta** con sus medios. **Matriz de audio** con nivel por cruce | Las X rojas que no explican la causa |
| **disguise** | Timeline + escenario 3D | *Feed mapping*: **rectángulos del lienzo copiados a rectángulos de pantalla**, con herramientas para partir y duplicar | El 3D como punto de partida: excesivo para una sala |
| **Pixera** | Modos Screens → Mapping → Compositing | **Las secciones siguen el orden en que se monta una sala** y cada modo enseña sólo sus herramientas | — |
| **Watchout** | Ventana de escenario con las pantallas como rectángulos rotulados | **Las pantallas se dibujan como rectángulos con su nombre y resolución**; *Pack Inside Display* encaja un elemento en una pantalla | — |
| **Smode** | Árbol de capas | El orden de las capas es explícito y se lee de arriba abajo | El árbol: demasiado abstracto para pensar en clips |
| **Mitti** | Lista de reproducción de cues | **Vista de lista** como alternativa a la rejilla en pantallas pequeñas; acción de final y ruteo de audio junto al cue | — |
| **TouchDesigner (Window COMP)** | Ventana de *perform* | **Una sola ventana que cubre todos los monitores** | — |
| **QLab Remote / touchAble** | Mando en el móvil | Sincronía en los dos sentidos: el mando enseña **lo que está sonando**, no sólo botones | Abrirse ya en modo «control» sin protección |

### 2b.3 Consecuencias de diseño para VEATION Touch

1. **Live sólo tiene tres cosas**: el monitor de la sala, la estantería de experiencias y la rejilla. Sin efectos, sin
   BPM, sin navegador permanente. El inspector aparece al seleccionar algo.
2. **Miniatura = lanzar, nombre = seleccionar** (Resolume, Ableton). En el teléfono, toque = lanzar y pulsación larga =
   detalles.
3. **Lo que está en vivo se ve en cian** (`#4FC3E8`, el acento «vivo» del contrato): borde de la celda, tarjeta de la
   experiencia, fila de la capa. **Lo que pide atención va en ámbar** (`#E5B567`): copiando, archivo que falta,
   reproduciendo desde el USB, blackout. No hace falta un tercer color.
4. **Estado de reproducción al estilo Ableton**: círculo para bucles, barra + tiempo restante para una sola pasada.
5. **Un clip tiene un punto de estado**: gris = copiando, cian = listo, ámbar = problema (con el motivo al pasar por encima).
6. **Un único indicador «Problems (n)»** en la barra superior: medios que faltan, dispositivos de audio que no están,
   pantallas desconectadas. Abre la lista con la acción de arreglo de cada uno (QLab).
7. **Arrastrar del explorador a cualquier sitio que tenga sentido**: celda, capa, deck, ranura de un preset.
8. **Valores por defecto en la capa, heredados por los clips** («Layer default»).
9. **Output se organiza como el Advanced Output**: lista Screens ▸ Slices a la izquierda, lienzo central con las
   pestañas *Input* / *Output*, números a la derecha, flechas 1 px / Mayús 10 px, y un botón de vista partida que
   enseña las dos etapas a la vez (MadMapper).
10. **Las pantallas son rectángulos rotulados** con su resolución real; los slices se imantan a bordes y cuadrantes; y
    hay plantillas de un clic («Datapath Fx4 2×2», «One display per wall») que crean los slices desde los muros.
11. **El orden de las secciones es el de montar una sala** (Setup → Output → Live), pero la app abre en **Live** cuando
    la sala ya está lista.
12. **El teléfono enseña primero qué está saliendo**, tiene «Next column», blackout con pulsación mantenida y un
    bloqueo de pantalla contra toques accidentales.
13. **Audio: una elección de una línea** («All speakers», con un fader de anchura estéreo) y la matriz detrás de «Advanced».

---

## 3. Lo que se reutiliza de VEATION (Immersive Studio Pro)

Los dos programas son del mismo dueño: el código se copia y se adapta. VEATION no tiene módulos (`app.js` de 2,7 MB);
aquí se reparte en módulos ES pequeños y con comentarios en inglés, como el resto de este repo.

### 3.1 Qué se copia y qué se porta

| Origen (VEATION) | Qué | Destino | Adaptación |
|---|---|---|---|
| `hap-worker.js` › `snappyDecompress`, `flush` | Snappy «raw» con fusión de rachas | `engine/media/hap.js` (y servido como `/shared/hap.js`) | Copia literal. Es puro: se prueba en Node |
| `hap-worker.js` › `sec`, `hapDecode`, `TEX` | Secciones HAP, compresores A/B/C (trozos con *Decode Instructions*) | `engine/media/hap.js` | Copia. Errores con código (`hapm:`, `not-hap:`) que la interfaz traduce |
| `hap-worker.js` › `movIndex` | Índice del `.mov`: `stsd/stsz/stco/co64/stsc/stts/elst`, instante por muestra | `engine/media/mov.js` (y `/shared/mov.js`) | Se amplía con la **pista de audio** (§3.3). Recibe una función `read(offset, length)` para servir en Node y en el worker |
| `hap-worker.js` › `iniciarGL`, `texComp`, `fotograma`, bucle `onmessage` | Subida S3TC, YCoCg→RGB, premultiplicado de DXT5, `transferToImageBitmap` | `ui/js/mixer/hap-worker.js` | Copia. Mismos mensajes `init/info/frame/close`. Orientación ya medida: fila 0 = arriba, sin voltear |
| `app.js` › `HAPX`, `hapInit`, `hapNW`, `hapCall`, `hapMsg` | Pool de workers, una petición en vuelo por worker, plazos | `ui/js/mixer/hap-pool.js` | Porte limpio |
| `app.js` › `hapPlayer`, `driveHAP`, `hapIdx`, `hapPedir`, `hapEntregar`, `hapSeek`, `hapAparcar` | Reproductor por instancia: ventana de petición = cabezal + latencia medida, regla «llegó tarde pero es más nuevo», trayectorias (`tray`), aparcado que libera VRAM | `ui/js/mixer/hap-player.js` | Se quita todo lo del editor (nidos, `dirDeClip`, centinela, zancada por velocidad). Queda: avanzar, bucle, bounce, posicionar |
| `app.js` › `hapVuelta`, `hapSoltarVuelta` | Precarga de los primeros fotogramas antes del salto del bucle | `hap-player.js` | Se generaliza: también precarga el **primer fotograma del siguiente clip** (autopilot y fundidos sin hueco) |
| `app.js` › `hapReparto*`, `hapSiguiente`, `hapColgada` | Reparto de workers por coste (píxeles × fps) | `hap-pool.js` | Se simplifica: aquí casi todos los clips miden lo mismo |
| `app.js` › `upTexHap` | `texSubImage2D(ImageBitmap)` + `close()` | `ui/js/mixer/gl.js` | Copia |
| `app.js` › `hapFrame`, `hapSection`, `movBuild`, `movFtyp`, `_stsdPCM`, `audioPCM16`, `snappyCompress` | **Codificador** HAP y escritor de `.mov` | `tests/fixtures/media/make-hap.mjs` | Sólo para **fabricar archivos de prueba** diminutos sin FFmpeg. No va en la app |
| `docs/adr/adr-0012` | Workers con Node (`nodeIntegrationInWorker`) y guarda de navegación | `app/main.js` › `applyOutputWindow` | La ventana de salida ya tiene `sandbox: false` y `will-navigate` cerrado a nuestro servidor |
| `index.html` + `docs/MARCA.md` | Tokens, fader sin tirador, paneles | `ui/app.css`, `ui/js/dom.js` | Ya adoptados (`fader()`); los paneles nuevos copian el inspector de VEATION |

**No se trae:** `ClipDecoder` (WebCodecs para H.264/HEVC), el camino `<video>`, el export, NDI en UYVY, proxies.
Motivo: los clips de sala son HAP. Un respaldo con `<video>` para MP4 pequeños se deja como mejora posterior (R9).

### 3.2 Límites que vienen de Chromium

- **El proceso GPU de Chromium serializa las subidas de textura de todos los contextos a ~1–1,5 GB/s** (medido en
  VEATION). Es el techo real, sea cual sea el códec.
- **Un `ImageBitmap` no cruza procesos**: la decodificación tiene que vivir en workers **de la misma ventana** que compone.
- **`fetch(file://)` falla en workers de Electron y `protocol.handle` cuesta ~200 ms por 4 MB** (medido en VEATION): por
  eso los workers leen con `fs`.
- **Una ventana oculta no recibe `requestAnimationFrame`** (ya documentado aquí: 26 fps). La salida es visible o fuera
  de pantalla (OSR), nunca oculta.
- **`<audio>`/`<video>` con un `.mov` de HAP + PCM no es fiable**: Chromium no decodifica HAP y no hay garantía de que
  reproduzca sólo la pista PCM. Por eso el audio se lee con código propio.
- **Etiquetas de dispositivos de audio** sólo tras un permiso de micrófono (ya resuelto en `app/main.js`).

### 3.3 Códec: qué variantes de HAP y qué audio

**Vídeo** (especificación `Vidvox/hap`):

| Variante | FourCC | Textura | Bytes por píxel | Soporte |
|---|---|---|---|---|
| HAP | `Hap1` | DXT1 / BC1 | 0,5 | **Sí** |
| HAP Alpha | `Hap5` | DXT5 / BC3 | 1 | **Sí** (sale premultiplicado del worker) |
| HAP Q | `HapY` | YCoCg escalado en DXT5 | 1 | **Sí** |
| HAP Q Alpha | `HapM` | YCoCg DXT5 + BC4 | 1,5 | No en v1: mensaje claro. Se añade después si hace falta (pide `EXT_texture_compression_rgtc`) |
| HAP R / HDR / Alpha-Only | `Hap7` / `HapH` / `HapA` | BC7 / BC6H / BC4 | — | No. Mensaje claro |

Las tres admitidas son las que producen FFmpeg, el exportador de Adobe (disguise) y el propio VEATION. Se admiten
fotogramas sin comprimir, con Snappy y **troceados** (VEATION exporta con 2–8 trozos; el exportador de Adobe también).
Dimensiones: 7196 y 912 son múltiplos de 4 (el codificador de FFmpeg lo exige); el worker ya redondea hacia arriba.

**Audio.** Dato comprobado en el código: el export HAP de VEATION escribe **PCM de 16 bits `sowt`** intercalado
fotograma a fotograma (`movBuild`, `_stsdPCM`). Dato de la investigación: Resolume Alley **no** exporta HAP (sólo DXV);
el exportador de Adobe añadió audio en 1.0.9/1.2.0. Se soporta en `engine/media/mov.js`:

| Código en `stsd` | Formato | Soporte |
|---|---|---|
| `sowt`, `twos` | PCM 16 bits LE / BE | **Sí** |
| `in24`, `in32` | PCM 24 / 32 bits (el orden lo da el átomo `enda`) | **Sí** |
| `fl32`, `fl64` | Coma flotante | **Sí** |
| `lpcm` | PCM de QuickTime v2 (marcas de formato) | **Sí** |
| `mp4a` (AAC, el valor por defecto de FFmpeg) | Comprimido | **No en v1**: el clip se importa y se avisa «audio will not play (AAC)». Mejora posterior con WebCodecs `AudioDecoder` |

Canales: 1 a 16. Frecuencia: cualquiera; se convierte a 48 kHz en el reproductor.

### 3.4 Cuentas de rendimiento para 7196×912

| Magnitud | Valor | Origen |
|---|---|---|
| Píxeles por fotograma | 6 562 752 | cuenta |
| Textura HAP (DXT1) | 3,28 MB | cuenta |
| Textura HAP Q / HAP Alpha | 6,56 MB | cuenta |
| Fotograma en RGBA | 26,3 MB | cuenta |
| Salida 3840×2400 | 9 216 000 px | cuenta |

**Disco** (material real con Snappy: 2,6–3,4 bits/px en HAP y 4,9–6,3 en HAP Q, derivado de las pruebas de VDMX):

| | Por fotograma | 30 fps | 60 fps | Reel de 5 min |
|---|---|---|---|---|
| HAP, material real | 2,1–2,8 MB | 64–83 MB/s | 127–166 MB/s | 19–25 GB (30) · 38–50 GB (60) |
| HAP, peor caso | 3,28 MB | 98 MB/s | 197 MB/s | 30 / 59 GB |
| HAP Q, material real | 4,0–5,2 MB | 120–156 MB/s | 239–311 MB/s | 36–47 / 72–93 GB |
| HAP Q, peor caso | 6,56 MB | 197 MB/s | 394 MB/s | 59 / 118 GB |

Consecuencia: **la biblioteca tiene que estar en un SSD** (SATA basta para HAP; NVMe para HAP Q a 60). Un disco
mecánico (≈150 MB/s) no llega a 60 fps. La importación mide la velocidad del disco de destino y avisa.

**Decodificación y subida** (estimado, escalando lo medido en VEATION a 4096²):

| Paso | Medido en VEATION (4096²) | Estimado a 7196×912 HAP | HAP Q |
|---|---|---|---|
| Lectura (`fs.readSync`, SSD) | — | 1–2 ms | 2–4 ms |
| Snappy en JS | 4,1 ms por 8,4 MB (HAP) · 7,9 ms por 16,8 MB (HAP Q) | 1,6–3 ms | 3–6 ms |
| Subida comprimida en el worker | 5–7 ms por 8,4 MB · 10–15 ms por 16,8 MB | 2–3 ms | 4–6 ms |
| Copia `ImageBitmap` → textura (hilo principal) | 0,1 ms | 0,1 ms | 0,1 ms |
| **Total por fotograma en el worker** | | **5–8 ms** | **9–16 ms** |

- A 60 fps hay 16,7 ms por fotograma: **una capa HAP cabe en un worker con margen**. HAP Q a 60 va justo y necesita dos
  workers alternándose (el pool tiene 2–4, `hapNW()`).
- Presupuesto del proceso GPU: una capa HAP a 60 fps son 197 MB/s de subidas, **el 13–20 % del techo**. Dos capas
  durante un fundido, 394 MB/s. VEATION reproduce sin perder fotogramas una capa de 503 MB/s (4096² HAP a 60).
- **Recomendación de entrega: HAP (no HAP Q) a 30 o 60 fps.** HAP Q sólo si el material tiene degradados que lo pidan.

**Composición** (estimado): el FBO de contenido son 6,6 Mpx; 4 capas a 60 fps son ~1,6 Gpx/s, y el paso de slices a
3840×2400, 0,55 Gpx/s. Es poco para una GPU RTX. Lo caro no es componer, es (a) la experiencia que esté viva y (b) la
copia de su lienzo al mezclador (incógnita de F0).

**Memoria de vídeo por capa que reproduce** (estimado): textura de capa 26 MB + caché de anticipación de 3–8 fotogramas
(79–210 MB) + lienzo del worker 26 MB ⇒ **130–260 MB por capa**. Con dos capas en fundido y el FBO, menos de 0,6 GB.
Regla heredada de VEATION: un reproductor que deja de verse **se aparca** y suelta sus `ImageBitmap` (`hapAparcar`).

**Memoria principal**: búferes de lectura y salida por worker (10–13 MB cada uno); el anillo de PCM (2 s estéreo) 0,8 MB.
El motor no lee vídeo: su tope de 256 MB de heap no se toca.

---

## 4. Arquitectura

### 4.1 Procesos

```
Electron main (app/main.js)
  ├─ ENGINE (utilityProcess)                      engine/engine.js + engine/media/*
  │     sensores → toques (sin cambios)
  │     MediaEngine: biblioteca, show, TRANSPORTE (quién suena, desde cuándo), presets
  │       └─ worker_thread de importación: copia, huella, índice, miniatura
  │     HTTP: /api/media/thumb/…  /api/media/pcm (sólo este equipo)
  ├─ Ventana de operador (UI)                      Live · Output · Setup
  ├─ Ventana de SALIDA (/output?run=1)             ui/js/output.js + ui/js/mixer/*
  │     sink 'screens' → visible, sin marco, sobre la(s) pantalla(s), vsync
  │     sink 'spout'   → fuera de pantalla, textura compartida → addon Spout (como hoy)
  │     mezclador WebGL2: experiencia (iframe) + capas de clips + toques + rejilla → FBO de contenido
  │       → 'spout': FBO 1:1   → 'screens': slices sobre cada pantalla
  │     workers HAP (con Node: leen el disco) → ImageBitmap
  └─ Ventana de AUDIO (/audio, oculta)             ui/js/audio-host.js + ui/js/audio-media.js
        grafo de sala + bus de clips; PCM pedido al motor por HTTP local
Teléfonos (LAN o relé) → /ws/ui: estado + órdenes + miniaturas. Nunca vídeo ni audio.
```

Tres reglas:
1. **El motor decide, las páginas ejecutan.** El motor nunca toca un fotograma ni una muestra.
2. **La ventana de salida no depende de que el motor esté vivo para seguir reproduciendo.** Hoy `app/main.js` cierra la
   ventana de salida cuando el motor muere (`engine.on('exit')` → `closeOutputWindow()`). Se cambia: la ventana se
   queda, sigue con lo que tenía y se reconecta (`conn.js` ya reintenta). Un reinicio del motor no deja la sala en negro.
3. **Sólo la ventana de salida tiene Node en sus workers**, y sólo carga nuestro servidor local (guarda `will-navigate`
   ya existente). Las experiencias son código de confianza del propio repo (R6).

### 4.2 Modelo de datos

**Show** (`<datos>/shows/<id>.json`, con copias de versión como los perfiles; puerta única `normalizeShow`):

```js
{
  schema: 1, id: 'alma-reel', name: 'Alma Digital — Reel',
  canvas: { width: 7196, height: 912 },          // para qué lienzo se hizo (sólo para avisar)
  media: [{                                        // archivos de la biblioteca que usa este show
    id: 'm1', file: 'alma-reel/Reel 2026.mov',     // ruta RELATIVA a la biblioteca
    size: 21474836480, mtimeMs: 0, fingerprint: 'sha1 de 1 MB inicial + 1 MB final + tamaño',
    video: { fourcc: 'Hap1', width: 7196, height: 912, fps: 30, frames: 9000, duration: 300 },
    audio: { format: 's16le', channels: 2, rate: 48000 } | null,
    thumb: 'm1',                                   // /api/media/thumb/m1.png
  }],
  clips: [{                                        // un clip = un medio + cómo se reproduce
    id: 'c1', mediaId: 'm1', name: 'Reel', color: null,
    end: 'layer' | 'loop' | 'hold' | 'clear' | 'bounce' | 'next' | 'prev' | 'random' | 'first',
    loops: 1, in: 0, out: null,
    trigger: 'layer' | 'restart' | 'toggle',
    transitionMs: null,                            // null = el de la capa
    place: { target: 'canvas' | 'wall' | 'walls', wallId: null, fit: 'stretch' | 'fit' | 'fill' },
    audio: { gainDb: 0, route: null },             // route null = la de la capa
  }],
  layers: [{                                       // de abajo arriba
    id: 'L1', name: 'Layer 1', opacity: 1, blend: 'normal', bypass: false,
    transitionMs: 500, end: 'loop', trigger: 'restart', ignoreColumn: false,
    audio: { volume: 1, mute: false, route: null }, // route null = la de la sala
  }],
  decks: [{ id: 'D1', name: 'Main', columns: 8, cells: { 'L1:0': 'c1' } }],   // 'capa:columna' → clip
  presets: [{                                      // «qué sale»: una tarjeta de Live
    id: 'p1', name: 'Alma liquid', experienceId: 'alma-fluid', params: { quality: 'ultra' },
    sound: { id: 'ambient-notes', params: {} } | null,
    media: { reel: 'c1', projects: ['c2', 'c3'] }, // ranuras que declara el manifiesto de la experiencia
    onLoad: 'keep' | 'clear',                      // qué pasa con los clips de la rejilla al cargarlo
  }],
  start: { presetId: 'p1', deckId: 'D1', column: null },   // qué hace la sala al arrancar
}
```

**Transporte** (en memoria del motor; instantánea en `<datos>/run/transport.json` en cada cambio, para reinicios):

```js
state.media = {
  rev, blackout: false,
  preset: { id, state: 'loading' | 'live' | 'error', error },
  layers: { L1: { playId, clipId, startAt, offset, from: { clipId, startAt } | null, transitionMs, state: 'playing' | 'held' | 'empty' } },
  xlayer: { … },                                   // la capa reservada a los clips que lanza la experiencia
  import: [{ id, name, done, total, mbps, etaS, state, error }],
  problems: [{ kind: 'missing-media' | 'display' | 'audio-device' | 'copy', text, fix }],
}
```

`startAt` es tiempo del motor (ms, el mismo reloj que `live.t`). La posición de un clip es
`(ahoraMotor − startAt) + offset`, plegada según su modo de final. `from` es el clip saliente durante un fundido.

**Perfil** (`engine/profile.js`, añadidos; detalle en §5.3): `output.sink: 'screens'`, `output.screens[]`, capa `media`
en `output.layers`, `audio.media`, y `media: { showId, autostart }`.

**Ajustes de la máquina** (`settings.json`): `mediaDir` (dónde está la biblioteca).

### 4.3 Protocolo motor ↔ UI ↔ teléfono (todo por `/ws/ui`, como hoy)

**Órdenes nuevas** (el motor las delega en `engine/media/index.js`; `engine.js` sólo reparte por prefijo):

| Orden | Qué hace | Show mode |
|---|---|---|
| `clip.trigger {clipId \| deckId, layerId, column}` | Lanza un clip en su capa | permitido |
| `column.trigger {deckId, column}` | Lanza la columna (salta capas con `ignoreColumn`) | permitido |
| `column.next {dir: 1 \| -1}` | Columna siguiente / anterior | permitido |
| `layer.clear {layerId}` · `media.clearAll` | Expulsa con la transición de la capa | permitido |
| `layer.set {layerId, opacity, blend, bypass, volume, mute}` | Mezcla en vivo (con guardado diferido 700 ms) | permitido |
| `media.blackout {on}` | Funde a negro y silencia; se levanta igual | permitido |
| `preset.load {presetId}` · `preset.unload` | Cambia la experiencia viva | permitido |
| `preset.param {presetId, key, value}` | Parámetro de la experiencia del preset | permitido |
| `show.update {show, rev}` | Edición de rejilla, clips, capas, decks, presets (revisión; una edición vieja se rechaza) | **bloqueado** |
| `show.load / create / delete / export / import` | Gestión de shows | **bloqueado** |
| `media.import {paths, target}` · `media.importCancel {id}` | Importar desde disco o USB | **bloqueado** |
| `media.relink {dir}` · `media.remove {mediaId}` | Reubicar / quitar | **bloqueado** |
| `media.setDir {dir}` | Cambiar la carpeta de la biblioteca (sólo en este equipo) | **bloqueado** |
| `output.screens {screens}` · `output.testCard {on, screenId}` | Advanced Output | **bloqueado** (la carta de ajuste no) |
| `audio.media {level, avOffsetMs, route, width, front, matrix, duckDb}` | Ruteo y nivel del audio de clips | ruteo bloqueado; nivel permitido |
| `media.report {…}` | La página de salida informa: fotogramas tarde, errores de archivo | (interno) |

**Mensajes nuevos del servidor:**
- `{type: 'media', …state.media}` — **sólo cuando cambia el transporte**. Un lanzamiento son ~300 bytes; no se reenvía
  el estado entero (que hoy incluye el perfil completo). El progreso no viaja: cada cliente lo calcula con el reloj.
- `{type: 'mediaEvent', event: 'ended' | 'started' | 'error', playId, clipId, layerId}` — para el runtime de experiencias.
- El `state` inicial incluye `show`, `media` y `library` (carpeta, espacio libre).

**Reloj compartido**: `ui/js/clock.js` estima el desfase motor↔página con `live.t`, siguiendo los mensajes más rápidos
(el algoritmo de `makeHands › ingest`, extraído). Lo usan el mezclador, la página de audio y las barras de progreso.

**Permisos**: lanzar está abierto a cualquier dispositivo emparejado (gana el último). Editar el show usa revisión,
como `profile.update`. Mientras alguien calibra, el control de calibración sigue como hoy (`CONTROL_OPS`); las órdenes
de Live no entran en esa lista.

**Rutas HTTP nuevas** (`engine/server.js`):
- `GET /api/media/thumb/<mediaId>.png?s=160|480` — misma regla que la UI (este equipo o la clave); `Cache-Control:
  immutable` con la huella en la URL. Pasa por el relé.
- `GET /api/media/pcm?clip=…&from=<muestra>&n=<muestras>` — **sólo este equipo** (`peerOf(req).local`); PCM crudo + cabeceras
  de formato. Rechazado por LAN y por el relé.
- No existe ninguna ruta que sirva vídeo.

### 4.4 Cómo llaman las experiencias al motor de medios

`experiences/runtime.js` gana `vt.media` (sólo en la instancia real; en el visor y en modo autónomo es un simulacro
que resuelve al instante, para que la pieza se pueda desarrollar sin motor):

```js
vt.media.available                       // false en standalone / viewer
vt.media.slot('reel')                    // → clip | null        (ranuras declaradas en el manifiesto)
vt.media.slot('projects')                // → [clip, …]          clip = { id, name, duration, hasAudio, thumb, missing }
vt.media.preload(clipId)                 // deja listo el primer fotograma (máx. 8 clips; el más antiguo sale)
vt.media.play(clipId, { end: 'clear', transitionMs: 600 })   // → Promise<{ playId }>
vt.media.stop({ transitionMs: 400 })     // para lo que lanzó esta experiencia
vt.media.on('ended' | 'started' | 'error', fn)               // { playId, clipId }
vt.media.state()                         // { playing, clipId, position, duration }
```

- El manifiesto declara las ranuras: `"media": [{ "key": "reel", "label": "Reel clip", "type": "clip" }, { "key":
  "projects", "label": "Projects", "type": "clips", "max": 12 }]` (`engine/experiences.js › normManifest`). El operador
  las rellena en Live arrastrando clips al inspector del preset. El nombre que enseña la experiencia es el del clip.
- Lo que lanza una experiencia va a la **capa reservada** (`xlayer`), que en Live se ve como una fila de sólo lectura
  «Experience clips» con su X. Al descargar el preset, lo que lanzó se para solo.
- El runtime también expone lo que Reel necesita para colocar botones: `vt.walls[i]` gana `width`, `height` (metros),
  `pxPerM` y `masks` (rectángulos en píxeles). Es un añadido; nada de lo actual cambia.

### 4.5 Cómo llega la composición a la sala

Orden de composición de la salida, de abajo arriba (lo fija `profile.output.layers`, reordenable):

```
experience   la experiencia viva (iframe; su lienzo se copia a una textura)
media        el grupo de capas de clips: L1 … Ln, y encima la capa reservada «Experience clips»
touches      la máscara de toques (lienzo 2D de TouchMask → textura cuando cambia)
grid         el mapa de píxeles y los objetivos de calibración (lienzo 2D → textura cuando cambia)
(feedback)   lo que se mueve durante una calibración (lienzo 2D, rectángulos sucios)
```

- **Experiencia → textura.** En modo capa, `frameOut` del runtime llama a `parent.__vtLayerFrame(canvas)` **en la misma
  tarea en que dibujó** (mismo origen, mismo hilo) y el mezclador hace `texSubImage2D(canvas)`. Tiene que ser en la
  misma tarea porque un lienzo WebGL sin `preserveDrawingBuffer` queda vacío tras presentarse (el visor ya lo resuelve
  así con `createImageBitmap`). El iframe sigue en el documento, a tamaño completo y tapado por el lienzo del mezclador.
- **Experiencias con transparencia.** Un preset puede pedir ir **encima** del grupo `media` (el manifiesto declara
  `"transparent": true`): su lienzo es premultiplicado y deja ver el vídeo. Reel lo usa para dibujar sobre el vídeo.
- **Clips.** Cada capa que reproduce tiene un `HapPlayer`; en cada fotograma pide al reloj su índice, entrega lo que
  tenga en caché y dibuja. Un fundido son dos reproductores vivos y un sombreador `mix(A, B, t)`.
- **Blends** con mezcla fija sobre premultiplicado: normal (`ONE, ONE_MINUS_SRC_ALPHA`), add (`ONE, ONE`), screen
  (`ONE, ONE_MINUS_SRC_COLOR`), multiply (`DST_COLOR, ZERO` con la opacidad resuelta en el sombreador).
- **Modo calibración** (`state.output.calibrating`): se dibujan sólo `touches` + `grid`, como hoy. Los reproductores se
  aparcan (no decodifican) y el audio de clips se atenúa a cero; al terminar, vuelven **a su sitio por reloj**.
- **Cambio de experiencia sin negro.** El mezclador conserva la última textura de la experiencia saliente. Se quita su
  iframe, se carga el nuevo y, cuando llega su primer fotograma, se funde de la imagen congelada a la nueva (0,8 s).
  Nunca hay dos experiencias vivas.
- **Salida.** `spout`: el FBO se copia 1:1 al lienzo (ventana fuera de pantalla, como hoy). `window`: el FBO encajado
  en una pantalla (como hoy). `screens`: por cada slice, un cuadrilátero que muestrea el FBO (§5).
- **Vista previa para la app.** El mezclador reduce el FBO a ≤ 960 px de ancho, lo lee de forma asíncrona (PBO +
  `fenceSync`) y publica un JPEG a 10 fps en `/api/experience/preview` (ruta existente). Hoy es 1 fps y captura la
  ventana entera desde el proceso principal; con 3840×2400 eso sería caro.

---

## 4b. Arquitectura de información

### 4b.1 Hoy

`ui/index.html` tiene 9 pestañas al mismo nivel (`#nav button[data-view]`): **Live, Room, Mapping, Sensors, Calibrate,
Zones, Outputs, Experiences, System**. La barra superior añade el selector de sala, los chips de salud, el selector
de proyección (Off / Pattern / Debug), *Show* y *Connect device*. El lienzo central cambia de modo con cada pestaña
(`ui/js/workspace.js › setMode`) y el panel derecho es su inspector (`ui/js/views.js`). La pestaña Experiences mezcla
tres cosas distintas: qué pieza suena, a dónde va la imagen (Spout, escala, capas) y los dispositivos de audio.

### 4b.2 Navegación propuesta

Tres secciones en el carril izquierdo; cada una con una barra de subpestañas propia.

```
LIVE     (una sola pantalla; es donde arranca una sala ya montada)
OUTPUT   Screens · Audio · Protocols
SETUP    Status · Room · Sensors · Calibrate · Zones · System
```

| Sección › subpestaña | Qué vive ahí | Viene de |
|---|---|---|
| **Live** | Monitor de la sala (tira 2D / 3D con la salida real y los toques) · estantería de experiencias · rejilla de clips con decks · tira de capas (opacidad, volumen, X) · master, mute y blackout · inspector de lo seleccionado · cajón de biblioteca con el progreso de importación | Nuevo. El monitor reutiliza el modo `live` del workspace y `room3d.js`. Los parámetros de la experiencia vienen de Experiences |
| **Output › Screens** | Advanced Output: lista Screens ▸ Slices, etapas *Input* y *Output*, carta de ajuste. Arriba, el destino: **Screens / Spout / Single window**, escala y fps | *Input* es la pestaña **Mapping** de hoy (muro → lienzo). El destino viene de Experiences › Output. El selector de proyección de la barra superior baja aquí |
| **Output › Audio** | Dispositivos, canales, mapa muro→canal, sub, filtros, techo, prueba por canal, ruteo del audio de clips, desfase A/V | La tarjeta Audio de Experiences |
| **Output › Protocols** | OSC, TUIO, Triggers, Webhook, Art-Net, sACN, Texture (NDI / pantalla completa), y las capas `touches` y `grid` de la salida | La pestaña **Outputs** y las capas de Experiences › Output |
| **Setup › Status** | Salud de sensores, contadores, registro de eventos | El panel de la pestaña **Live** de hoy |
| **Setup › Room** | Muros, medidas, planta, esquinas continuas | **Room** |
| **Setup › Sensors** | Sensores, descubrimiento, auto-align, level check, fondo | **Sensors** |
| **Setup › Calibrate** | Calibrar, verificar, rejilla en los muros | **Calibrate** |
| **Setup › Zones** | Zonas y máscaras | **Zones** |
| **Setup › System** | Salas, versiones, red, internet, grabaciones, procesado, registro, **carpeta de la biblioteca** | **System** |

**Barra superior** (igual en las tres secciones): sala · chips de salud · **Problems (n)** · **Blackout** · **Show** ·
**Connect device**. El blackout se ve en ámbar mientras está puesto, en todos los dispositivos.

**Migración sin romper pruebas.** Los identificadores de vista (`room`, `mapping`, `sensors`, `calibrate`, `zones`,
`outputs`, `system`) se conservan y `ctx.go(view)` sigue funcionando; sólo cambia su agrupación y su rótulo. El `live`
de hoy pasa a llamarse `status` y el identificador `live` queda para la sección nueva; `experiences` desaparece como
vista (su contenido se reparte) y `ctx.go('experiences')` redirige a Live. Las teclas 1–3 cambian de sección; dentro
de cada una, Tab recorre las subpestañas. La última sección y subpestaña se recuerdan por dispositivo, como hoy.

### 4b.3 Live en el escritorio

```
┌ Room ▾ ── ● sensors ● output 60 fps ── Problems (0) ─────────── [Blackout] [Show] [Connect device] ┐
│ L │ ┌ Monitor ───────────────────────────────────────────────────────────────────┐ ┌ Inspector ──┐ │
│ I │ │  P4      │   P1    │    P2     │   P3    ↻     (2D · 3D · Inside)   toques   │ │ Clip «Reel» │ │
│ V │ └─────────────────────────────────────────────────────────────────────────────┘ │ End  Clear ▾│ │
│ E │ ┌ Experiences ───────────────────────────────────────────────────────────────┐ │ Loops   1   │ │
│   │ │ [▣ Alma liquid  LIVE]  [▣ Reel]  [+]                                        │ │ Fit  Stretch│ │
│ O │ └─────────────────────────────────────────────────────────────────────────────┘ │ Transition  │ │
│ U │ ┌ Main │ Reel projects │ + ──────────────────────────────────────────────────┐ │ ▬▬▬▬▬ 0.5 s │ │
│ T │ │            ▶ 1      ▶ 2      ▶ 3      ▶ 4                                   │ │ Audio       │ │
│   │ │ X  L3     [thumb]  [     ]  [     ]            opacity ▬▬▬▬  vol ▬▬▬  M  B │ │ All speakers│ │
│ S │ │ X  L2     [thumb]  [thumb]  [     ]            opacity ▬▬▬▬  vol ▬▬▬  M  B │ │ Width ▬▬ 60%│ │
│ E │ │ X  L1     [thumb]  [     ]  [     ]            opacity ▬▬▬▬  vol ▬▬▬  M  B │ │ Gain  0 dB  │ │
│ T │ │ X  Experience clips  (read-only)                                            │ └─────────────┘ │
│   │ └─────────────────────────────────────────────────────────────────────────────┘                 │
│   │ ┌ Library ▾   Copying 2 of 7 · 12.4 / 31 GB · 4 min left ────── Master ▬▬▬▬▬ 30 %  [Mute] ┐      │
└───┴──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Celda**: miniatura (clic = lanzar), nombre debajo (clic = seleccionar), punto de estado, e indicador de
  reproducción (círculo si es bucle; barra + tiempo restante si no). La celda viva lleva borde cian.
- **Celda vacía**: destino de arrastre. Soltar varios archivos rellena columnas consecutivas de esa capa.
- **Todos los valores numéricos usan `fader()`** de `ui/js/dom.js`; ningún `input[type=range]` (la prueba existente
  que cuenta `input[type=range]` se extiende a las vistas nuevas).
- **Teclado**: 1–9 lanzan la columna, Mayús+1–9 seleccionan, Supr expulsa la capa seleccionada, Espacio = blackout
  (con confirmación la primera vez de la sesión), Ctrl+Z deshace ediciones del show (no lanzamientos).

### 4b.4 Las experiencias como presets en Live

- **Tarjeta**: miniatura (se toma de la salida la primera vez que el preset está vivo; se puede rehacer con «Use
  current frame»), nombre, pieza de sonido asociada y un punto de estado. La tarjeta viva lleva borde cian y «LIVE».
- **Clic en la tarjeta** = cargarla. **Clic en el nombre** = seleccionarla: el inspector enseña sus parámetros (los
  del manifiesto, con `fader()`), sus ranuras de clips y qué hace con la rejilla al cargarse.
- **Varias tarjetas de la misma experiencia** con parámetros distintos están permitidas (un «Alma liquid — pink» y un
  «Alma liquid — calm»). Cambiar entre dos tarjetas de la misma experiencia **no recarga la página**: sólo cambian los
  parámetros, en vivo (como hoy `experience.param`).
- **Qué pasa al cambiar de experiencia:**
  1. La imagen de la saliente se congela y se funde a la entrante cuando ésta entrega su primer fotograma (§4.5).
     Si la entrante no arranca en 5 s, se queda la congelada y la tarjeta pasa a ámbar con el error.
  2. Los clips que lanzó la experiencia saliente se paran con su transición.
  3. Los clips de la **rejilla** siguen (`onLoad: 'keep'`, por defecto) o se expulsan (`onLoad: 'clear'`), según el preset.
  4. La pieza de sonido cambia con el fundido de 1 s que ya existe (`audio-host.js › stopPiece/startPiece`).
- **Convivencia con los clips.** La experiencia es una capa más de la salida: por defecto va **debajo** de los clips,
  así que un clip opaco la tapa y, al expulsarlo, la experiencia vuelve. Una experiencia transparente puede ir encima.
  El orden se ve y se cambia en la tira de capas (arrastrando la fila «Experience»).
- **Sin experiencia**: la tarjeta «None» deja sólo los clips sobre negro. Así la sala funciona como media server puro.

---

## 4c. Audio de los clips

### 4c.1 Cadena

```
motor: /api/media/pcm (trozos de 0,5 s, PCM crudo del .mov)
  → página de audio (ui/js/audio-media.js): pide por delante, convierte a Float32, escribe en un anillo (SharedArrayBuffer)
  → worklet «vt-media-player» en el contexto de SÍNTESIS: lee el anillo con interpolación cúbica
       (convierte 44,1 → 48 kHz y corrige la deriva con ±0,3 % de velocidad)
  → ganancia del clip → volumen / mute de la capa (con rampa: el fundido de audio dura lo que el de vídeo)
  → matriz de ruteo [canal de origen × canal lógico]
  → bus de clips por canal lógico → el pasa-altos del muro de siempre → post[c]   (y a la suma del sub, si hay sub)
  → master × mute → limitador → anillos por dispositivo → Dante                   (todo esto ya existe)
```

Cambios en `ui/js/audio-graph.js › buildRoomAudio`: un bus `mbus[c]` por canal lógico que entra **antes** del
pasa-altos, igual que `bus[c]`, pero **fuera del fundido de las piezas** (`fadeNodes`), y un nivel común «Clips». El
limitador y el master no cambian: el audio de un clip nunca sale por encima del techo.

### 4c.2 Sincronía con el vídeo

- El motor fija `startAt`. La página de audio convierte ese instante a tiempo del contexto de síntesis (pareja
  `getOutputTimestamp()` ↔ `performance.now()`) y arranca la muestra 0 ahí, **adelantada** por la latencia conocida
  de salida (objetivo del anillo, 27 ms, + `outputLatency` del contexto del dispositivo) y por el ajuste de la sala
  `audio.media.avOffsetMs` (−200…+200 ms; compensa el retraso de Fx4 + proyectores frente a Dante + Q-SYS).
- El contexto de síntesis no tiene dispositivo (`sinkId: none`): avanza con el reloj del sistema, el mismo que el
  motor y el vídeo. La deriva frente a cada tarjeta ya la absorbe `RingReader` (±0,2 %).
- Cada 250 ms el reproductor compara su posición real con la que marca el reloj: hasta 80 ms corrige con velocidad
  (±0,3 %, inaudible); por encima, salta. **Objetivo: |audio − vídeo| < 20 ms estable y sin deriva en 5 minutos.**
- Lanzar un clip arranca 120 ms después de la orden (`PREROLL_MS`): es el tiempo para tener el primer fotograma y el
  primer trozo de PCM. Un clip precargado (`media.preload`) puede bajar a 50 ms.

### 4c.3 Modelo de ruteo y upmix

La ruta efectiva es la del clip, si la tiene; si no, la de su capa; si no, la de la sala (`profile.audio.media.route`).

| Ruta | Qué hace | Cuándo es la automática |
|---|---|---|
| `spread` — **All speakers** | Estéreo repartido por toda la sala según la planta: el muro `front` y el de enfrente reciben L+R, los de la izquierda L y los de la derecha R, con ley de potencia constante. El fader **Stereo width** (0–100 %) va de «mono idéntico en todos» a «reparto completo» | Clips de **2 canales** (por defecto, anchura 60 %) |
| `mono` — **Mono, all speakers** | Suma a mono, igual en todos los muros (potencia igual por muro, una vez por canal: la regla de `roomInput()`) | Clips de **1 canal** |
| `walls` — **One channel per wall** | El canal k va al muro k en el orden del lienzo; un canal de más va al sub (o se reparte si no hay) | Clips con **tantos canales como muros** (o muros + 1) |
| `direct` — **Direct** | El canal k va al canal lógico k | A mano, para contenido mezclado para esta sala |
| `matrix` — **Advanced** | Matriz de cruces con nivel en dB | A mano |

Cálculo de `spread` (función pura `mediaRouting()` en `ui/js/audio-core.js`): para cada muro con altavoces, su acimut θ
visto desde el centro de la sala sale de `roomPlan()` (0° = el muro `front`, positivo hacia la derecha);
`p = (1 + sin θ) / 2`; `gL = cos(p·π/2)`, `gR = sin(p·π/2)`; con la anchura `w`, cada ganancia es
`mix(0,707, g, w)`. **Cuando varios muros comparten un canal lógico, el canal recibe el máximo de cada origen, no la
suma** (la misma regla que ya aplica `roomInput()`).

**Comprobación con XR Lab** (mapa real: `P4→1`, `P1→3`, `P2→2`, `P3→2`; `front = P1`; sin sub; Q-SYS: canal 1 =
izquierda + frontal, canal 2 = trasera + derecha, canal 3 = frontal):

| Canal lógico | Muros | Anchura 100 % | Anchura 0 % (mono) |
|---|---|---|---|
| 1 | P4 (izquierda) | L × 1,00 | (L+R) × 0,707 |
| 2 | P2 (derecha) + P3 (detrás) | R × 1,00 + L × 0,707 | (L+R) × 0,707 |
| 3 | P1 (frente) | L × 0,707 + R × 0,707 | (L+R) × 0,707 |

Un vídeo estéreo suena por **todos** los altavoces de la sala, que es lo pedido. Esta tabla es una prueba (F7).

### 4c.4 Niveles

`ganancia del clip (dB)` → `volumen y mute de la capa` → `nivel «Clips» de la sala` → `Master` y `Mute` de siempre →
limitador. En Live se ven el volumen y el mute de cada capa y el master; el resto está en Output › Audio.

**Convivencia con la pieza de sonido** (Ambient notes): mientras suena un clip con audio, las piezas se atenúan
`audio.media.duckDb` (por defecto, a silencio con un fundido de 0,5 s) y vuelven al acabar. Un reel con su banda
sonora no debe competir con el colchón ambiental.

---

## 4d. Biblioteca de medios y arrastre desde un USB

### 4d.1 Dónde viven los archivos

- **Carpeta de la biblioteca**: `settings.mediaDir`, por máquina. Por defecto `<datos>/media`; se cambia en Setup ›
  System (con el espacio libre a la vista y la velocidad medida del disco). No va en el perfil ni en el repo.
- **Dentro**, una carpeta por show: `<biblioteca>/<show-id>/<archivo>.mov`. Las miniaturas van en
  `<datos>/thumbs/<huella>.png` (se regeneran si faltan).
- **Portabilidad**: el show guarda rutas relativas + tamaño + huella. *Export show…* crea una carpeta con `show.json`
  y los medios (para llevarla a otra máquina); *Import show…* la copia a la biblioteca.

### 4d.2 Referenciar o copiar: **copiar siempre**

| Soporte | Lectura típica | ¿Reproduce 7196×912? |
|---|---|---|
| Lápiz USB 2.0 | 20–30 MB/s | No |
| Lápiz USB 3.x corriente | 80–150 MB/s | HAP a 30 fps, justo; a 60, no |
| SSD externo USB 3.x | 300–900 MB/s | Sí |
| SSD interno | 500–3000 MB/s | Sí |

Windows no distingue de forma fiable un lápiz de un SSD externo (muchos se anuncian como disco fijo). Por eso la regla
no depende del tipo de unidad: **un clip se reproduce desde la biblioteca**. Importar copia, salvo que el archivo ya
esté dentro de la carpeta de la biblioteca. Es lo que hace QLab por defecto y es lo que evita el fallo más probable en
una sala: alguien se lleva el lápiz.

### 4d.3 El flujo, paso a paso

1. **Soltar** archivos en una celda, una capa, un deck, una ranura de preset o el cajón de la biblioteca. La ventana
   del operador obtiene las rutas con un preload mínimo (`webUtils.getPathForFile`) y envía `media.import`. Desde un
   navegador o un teléfono no hay rutas: la importación sólo existe en la app de escritorio (se dice en la interfaz).
2. **Validación inmediata** (lee sólo el índice del archivo; funciona igual con el archivo en el USB):

   | Caso | Resultado | Mensaje (inglés, como toda la interfaz) |
   |---|---|---|
   | HAP / HAP Alpha / HAP Q | Se acepta | — |
   | No es `.mov` (mp4, mkv…) | Se rechaza | `"clip.mp4" is not a HAP movie. VEATION Touch plays HAP (.mov) — export it as HAP or HAP Q.` |
   | `.mov` con otro códec | Se rechaza | `"clip.mov" is H.264, not HAP. Export it as HAP or HAP Q.` (ProRes, HEVC, DXV… con su nombre) |
   | HAP Q Alpha, HAP R, HAP HDR | Se rechaza | `HAP Q Alpha is not supported yet. Use HAP, HAP Alpha or HAP Q.` |
   | Índice ausente o truncado | Se rechaza | `"clip.mov" is incomplete (no index). Copy it again from the source.` |
   | Audio AAC u otro no PCM | Se acepta con aviso | `The audio of "clip.mov" is AAC and will not play. Export with PCM audio.` |
   | Tamaño distinto del lienzo | Se acepta con aviso | `This clip is 1920×1080; the room canvas is 7196×912. It will be stretched (change Fit).` |
   | No cabe en el disco | Se rechaza | `Not enough space: 21.4 GB needed, 9.8 GB free on D:.` |
   | Ya está en la biblioteca (misma huella) | Se reutiliza, sin copiar | `Already in the library.` |

   Los rechazados salen en una sola lista al final, no en un aviso por archivo.
3. **El clip aparece en la rejilla al instante**, con su miniatura (un fotograma leído del USB), el punto gris y un
   anillo de progreso. El cajón de la biblioteca enseña el total: `Copying 2 of 7 · 12.4 / 31 GB · 4 min left`.
4. **Copia en segundo plano** en un `worker_thread` del motor (nunca en su bucle de 60 Hz): secuencial, en bloques de
   8 MB, a `<nombre>.part`, `fsync` y renombrado al terminar. Se puede cancelar por archivo.
5. **Lanzar mientras copia.** Si la lectura medida del USB es al menos el doble de lo que pide el clip, se ofrece
   **Play from the drive**: la copia se detiene, el clip se reproduce desde el lápiz con el aviso ámbar `Playing from
   the USB drive — do not remove it`, y la copia sigue al terminar. Si no llega, el clip dice `Ready in 2:10`.
6. **Si se arranca el lápiz**:
   - *Durante la copia*: el clip pasa a ámbar, `Copy interrupted — plug the drive back in`. El `.part` se conserva y,
     al volver la unidad (misma huella de origen), la copia **continúa** desde donde iba.
   - *Reproduciendo desde el lápiz*: el worker recibe un error de lectura, el reproductor se marca roto (la ruta de
     `pl.roto` de VEATION), la capa mantiene el último fotograma 1 s y se expulsa con su transición. No hay cuelgue.
7. **Listo**: punto cian. A partir de ahí el archivo de la biblioteca es el único que se usa.

### 4d.4 Miniaturas

Las hace el motor, sin GPU, para que existan también sin la app de escritorio: se lee un fotograma (al 10 % de la
duración, o el que elija el operador con «Use current frame»), se descomprime y se toma **un color por bloque de 4×4**
de la textura DXT (un cuarto de resolución: 1799×228), se reduce y se escribe un PNG con `node:zlib`. Dos tamaños:

- **480 px** de ancho con la tira entera (480×61): para el inspector y el monitor.
- **160×90** con un recorte 16:9 centrado + la tira entera como banda inferior: para las celdas. Pesa 4–8 kB.

Una rejilla de 30 clips son ~200 kB que el teléfono descarga una vez (`Cache-Control: immutable`).

### 4d.5 Medios que faltan

Al cargar un show y cada 10 s se comprueba que cada archivo existe (`fs.stat`, barato). Si falta: celda con punto
ámbar y «Missing», entrada en **Problems**, y **Locate…**: se elige una carpeta, se busca por nombre + tamaño + huella
y se arreglan de una vez todos los que coincidan. Lanzar un clip que falta no hace nada en la sala y avisa a quien lanzó.

---

## 5. Advanced Output

### 5.1 Modelo

```
lienzo de contenido (7196×912)  ──Input──▶  slice (un rectángulo del lienzo)  ──Output──▶  región de una pantalla
        wall.pixelRect / wall.mapping                                                        rect · corners · grid
```

- **`wall.mapping` no cambia de significado**: sigue siendo muro → lienzo de contenido, y es lo que usan los toques,
  las zonas de lienzo y la calibración (`engine/core/geometry.js › wallUvToCanvas`). La herramienta Fit del mando
  sigue moviendo esa malla.
- **Lo nuevo es la segunda etapa**: lienzo → pantalla. La rejilla de calibración es una capa de la salida, así que
  atraviesa los slices y cae en la pared exactamente donde caerá el contenido.
- Un slice enlazado a un muro (`wallId`) **sigue su `pixelRect`**: si se mueve el muro en *Input*, el slice lo sigue.

### 5.2 Interfaz (Output › Screens)

- **Izquierda**: árbol Screens ▸ Slices. Cada pantalla enseña su nombre, resolución y si está conectada. Botones `+
  Screen`, `+ Slice`, y plantillas: **Slices from walls**, **Datapath Fx4 (2×2)**, **One display per wall**.
- **Centro**, dos etapas con pestañas y vista partida:
  - **Input**: el lienzo de contenido con el slice seleccionado resaltado. Es el workspace de Mapping de hoy
    (`workspace.js`, modo `mapping`) con la salida real o la imagen de referencia debajo.
  - **Output**: la pantalla como rectángulo rotulado a su resolución real, con sus slices. Se mueven, se escalan, se
    arrastran sus esquinas (corner pin) o se subdividen en malla, con las mismas interacciones que el Mapping.
- **Derecha**: X, Y, W, H numéricos de la etapa activa, modo (Rect / Corner pin / Grid), Flip H / V, y acciones
  **1:1 pixels**, **Fit to screen**, **Center**, **Match input to wall**.
- **Flechas** = 1 px, **Mayús + flechas** = 10 px. Imantado a bordes, a mitades y a cuartos de la pantalla.
- **Test card** por pantalla: borde de 1 px, diagonales, nombre y resolución, contorno y nombre de cada slice y barras
  de color. Se dibuja en espacio de pantalla, **después** de los slices: comprueba el cable y el Fx4, no el contenido.
- En un portátil sin las pantallas de la sala: **Preview window**, la misma composición en una ventana normal a escala.

### 5.3 Cambios en el esquema del perfil

```js
output: {
  on, senderName, displayId, fit, scale, fps,          // sin cambios
  sink: 'spout' | 'window' | 'screens',                // 'screens' es nuevo
  layers: [ experience, media, touches, grid ],        // 'media' es nuevo y opcional en la orden output.layers
  screens: [{
    id: 'SC1', name: 'Fx4', enabled: true,
    display: { id: 2528732444, x: 1920, y: 0, width: 3840, height: 2400, label: 'Fx4' },  // id + geometría para reencontrarla
    width: 3840, height: 2400,                         // resolución con la que se diseñó
    slices: [{
      id: 'SL1', name: 'P4', wallId: 'P4', enabled: true,
      input: null,                                     // null = el pixelRect del muro; o { x, y, w, h } en px de lienzo
      output: { mode: 'rect', rect: { x: 0, y: 0, w: 1912, h: 912 } },   // o corners: [[x,y]×4], o { us, vs, points }
      flipH: false, flipV: false,
    }],
  }],
},
audio: { …, media: { level: 1, avOffsetMs: 0, route: 'auto', width: 0.6, front: 'P1', matrix: null, duckDb: -60 } },
media: { showId: null, autostart: true },
```

- `normalizeProfile` sigue siendo la única puerta. Se añaden `normScreens`, `normSlice` (reutilizan `normGrid` y la
  validación de `corners`), `normAudioMedia` y `normMediaRef`. `SCHEMA` sigue en 1: como hasta ahora, la migración se
  decide por la presencia del campo (el patrón de `migrateRoomOutput`).
- **Identificar la pantalla**: el `displayId` de Electron puede cambiar entre arranques. Se guarda también su posición
  y tamaño; al arrancar se busca por id y, si no está, por geometría. Si no aparece, la salida no se abre a ciegas en
  otra pantalla: **Problems** dice `Screen "Fx4" (3840×2400) is not connected`.
- **Varias pantallas** (la configuración de 4 salidas HD directas): **una sola ventana** que cubre el rectángulo que las
  contiene y un *viewport* por pantalla. Una ventana por pantalla no sirve: cada una tendría su propio contexto de GPU y
  no podrían compartir el FBO. Requisitos que la interfaz comprueba y avisa: pantallas contiguas en Windows, mismo
  refresco y escala al 100 %. Con NVIDIA Mosaic las cuatro salidas son una sola pantalla y el caso se reduce al simple.

### 5.4 Migración de los perfiles existentes

| Perfil | Qué cambia al cargarlo | Qué no cambia |
|---|---|---|
| Cualquiera sin `output.screens` | `screens: []`, capa `media` añadida (encendida, opacidad 1, blend normal, entre `experience` y `touches`), `audio.media` y `media` con valores por defecto | `sink`, `layers` existentes, Spout, todo lo demás. **Ningún cambio de comportamiento** |
| `profile.experience` (id, autostart, params) | Al crear el primer show de una sala se genera un preset con esa experiencia, sus parámetros y la pieza de sonido de `audio.sound` | `profile.experience` y `audio.sound` siguen existiendo y reflejan el preset vivo: `experience.play/stop/param` y `sound.play/stop` (API pública) siguen funcionando como alias |
| `profiles/xrlab.json` (semilla) | Se añade una pantalla «Fx4» 3840×2400 con 4 slices, uno por muro, **1:1** (1912 / 1692 / 1920 / 1672 × 912) en los cuadrantes de 1920×1200. **`sink` se queda en `spout`** | El perfil guardado en el servidor de XR Lab no se toca (las semillas sólo llegan a instalaciones nuevas). El paso a `screens` lo hace el operador en la sala |
| `profiles/xrlab-sim.json` | Lo mismo, y un show de demostración con clips de prueba generados | — |

La colocación exacta de cada slice dentro de su cuadrante y qué muro va en qué salida del Fx4 no están en ningún
archivo de este repo: es la pregunta abierta 1.

---

## 6. La experiencia «Reel»

Carpeta `experiences/reel/`. Es una experiencia visual corriente (WebGL2) que usa `vt.media`. Sus clips **no** van en
la carpeta de la experiencia: son clips de la biblioteca asignados a las ranuras del preset.

### 6.1 Estados

```
            toque en «Play Reel»                       fin del clip (o mano mantenida 1,5 s)
  LANDING ───────────────────────▶ REEL ──────────────────────────────────────────────▶ LANDING
     │  toque en «See Projects»
     ▼                    toque en una ameba                    fin del clip (o mano mantenida 1,5 s)
   MENU ─────────────────────────────────▶ PROJECT(i) ─────────────────────────────────▶ MENU
     │  toque en «Back», o 60 s sin toques
     ▼
  LANDING
```

- La máquina de estados es un módulo puro (`experiences/reel/states.js`): recibe eventos (`hit`, `ended`, `error`,
  `tick`) y devuelve el estado y las acciones. Se prueba en Node sin GPU.
- **Fiabilidad**: si un clip no está (ranura vacía, archivo que falta) su botón o su ameba salen apagados y no
  responden; si `vt.media.play` falla o no llega `started` en 3 s, se vuelve al estado anterior y se informa del error
  a la app (`experience.report`). La sala nunca se queda en una pantalla sin salida.
- **Salir de un vídeo**: por defecto termina solo. `Hold to exit` (parámetro, activado): una mano quieta 1,5 s en
  cualquier muro, con un anillo que se llena bajo la mano. Un toque suelto no corta el vídeo (en una sala la gente se
  apoya en las paredes).

### 6.2 Detección de toques

- Posiciones en píxeles de la tira, con x **envuelta** cuando `vt.closedLoop` (la distancia corta, como `makeHands ›
  near`). Un objetivo está tocado si una mano de `vt.hands()` está a menos de su radio de acierto (radio visible ×
  1,15, y nunca menos de 0,25 m, convertido con `pxPerM` del muro).
- **Activación por permanencia** (`dwellMs`, por defecto 500): al entrar la mano hay respuesta inmediata (la ameba se
  hunde y brilla, el botón se ilumina); un anillo se llena; al completarse, se lanza. Evita disparos de quien pasa
  rozando y da la sensación de «lo he tocado». `dwellMs: 0` = al toque.
- Si la mano sale antes, el anillo se vacía. Dos manos en dos objetivos: gana el primero que complete.
- Los objetivos nunca se colocan sobre una **máscara** del muro (puertas, lámparas): ahí el sensor no ve.

### 6.3 Disposición en 360°

- **Fondo continuo**: un campo de color animado con la paleta de la web, periódico en x con periodo = ancho de la
  tira, así que no hay costura entre P3 y P4. Se comprueba con la prueba de costura de `tests/alma-fluid.test.mjs`
  (el salto en la columna de la costura no supera el de las columnas interiores).
- **Landing**: la marca y los dos botones **en cada muro**, centrados en él. En una sala cerrada la gente mira a
  cualquier pared. La marca usa las capas del logotipo que ya están en `experiences/alma-fluid/assets/` (blob +
  wordmark), con la «respiración» de la web (amplitud 2,5 %, periodo 7,2 s, cada capa con su fase). Los botones quedan
  **al alcance**: su centro entre 1,0 y 1,5 m del suelo, calculado en metros con la altura real del muro (la lección
  de Ambient notes: en muros de 3,5 m, «el centro del muro» está fuera de alcance).
- **Menú**: las amebas flotan con una deriva lenta, se repelen entre sí, evitan las esquinas (±0,3 m) y las máscaras,
  y se mantienen entre 0,9 y 1,7 m de altura. Parámetro `menuLayout`: `per-wall` (por defecto: **cada muro lleva todas
  las amebas**, así nadie tiene que rodear la sala para ver un proyecto) o `around` (un solo juego repartido por los
  360°, cruzando la costura).
- Una ameba que cruza la costura se dibuja dos veces (x y x ± ancho), igual que los emisores de Alma liquid.

### 6.4 Aspecto: Alma Digital

Tomado de `Code/Alma Digital Portfolio` (`index.html`, `CLAUDE.md`):
- **Paleta**: índigo `#3530a0`, lavanda `#8282ff`, rosa `#de79ff`, rosa suave `#fbc2ff`, violeta `#9a3ec7`, sobre el
  azul claro `#adc8ed` del fondo de la web. Es contenido de marca en la sala; la regla de dos acentos de `CLAUDE.md`
  rige la **interfaz** de la app, no el contenido proyectado (como ya pasa con Alma liquid).
- **Tipografía**: Raleway 200–300, mayúsculas con interletraje amplio para los botones y nombres de proyecto.
  Autoalojada en `experiences/reel/assets/fonts/` con su licencia OFL en `licenses/` (funciona sin internet).
- **Movimiento**: curvas `cubic-bezier(.22, 1, .36, 1)`, entradas de 0,6–1,2 s, nada brusco.
- **Amebas en 3D**: cada una es un cuadrilátero propio en el que el sombreador traza una esfera deformada por ruido 3D
  (marcha de rayos corta, 24–32 pasos), con luz de borde, translucidez y un degradado iridiscente de la paleta. Sólo
  pagan los píxeles cercanos a cada ameba, no la tira entera. El nombre del proyecto se dibuja con Canvas 2D a una
  textura y va bajo la ameba. Al tocarla se hunde hacia la mano.
- **Transiciones**: 0,6 s. Las amebas se encogen y se desvanecen mientras el vídeo entra con el fundido de su capa; al
  terminar, el camino inverso. El colchón de sonido se atenúa y el audio del clip entra y sale con el vídeo.

### 6.5 Parámetros y ranuras del manifiesto

`media`: `reel` (un clip), `projects` (hasta 12 clips; el nombre de cada ameba es el nombre del clip).
`params`: `dwellMs`, `holdToExit` (bool), `idleBackS`, `menuLayout`, `buttonHeight` (m), `blobSize` (m), `brandWall`
(`wall`: en qué muros sale la marca; vacío = todos), `quality`.
`transparent: true` (va encima del grupo de clips).

### 6.6 Archivos

```
experiences/reel/
  manifest.json   index.html   experience.js      arranque, bucle, dibujo
  states.js       máquina de estados (pura)        layout.js    colocación 360° en metros (pura)
  hit.js          aciertos y permanencia (pura)    blobs.js     sombreadores de las amebas
  assets/fonts/raleway-200.woff2, raleway-300.woff2          (el logotipo se toma de ../alma-fluid/assets/)
<biblioteca>/<show>/  Reel 2026.mov · Proyecto 1.mov … Proyecto 6.mov     (fuera del repo)
```

---

## 7. El mando del teléfono

### 7.1 Qué cambia

`ui/js/main.js` sigue enviando los dispositivos táctiles al mando. El mando gana una barra inferior con dos modos:
**Live** y **Calibrate**. Abre en Live si la sala está en Show mode o ya tiene todos sus muros verificados; si no,
abre en Calibrate con la guía de siempre (`nextTask()`). El modo Calibrate no cambia.

### 7.2 Live en el teléfono

```
┌──────────────────────────────┐
│ Barcelona XR Lab   🔒  ● 60  │  sala · bloqueo de pantalla · salud
│ NOW  Reel            2:14 ▮▮ │  qué sale: experiencia y clip por capa, con su X
│      L1 Background    ◔   ✕  │
├──────────────────────────────┤
│ Experiences                  │
│ [▣ Alma liquid] [▣ Reel LIVE]│  tarjetas grandes; toque = cargar
├──────────────────────────────┤
│ Deck: Main ▾        [◀] [▶]  │  columna anterior / siguiente
│ ┌────────┐ ┌────────┐        │
│ │ thumb  │ │ thumb  │        │  celdas de 2 columnas, ≥ 64 px de alto
│ │ Reel   │ │ Loop A │        │  toque = lanzar · pulsación larga = detalles
│ └────────┘ └────────┘        │
├──────────────────────────────┤
│ Master ▬▬▬▬▬▬▬▬ 30 %  [Mute] │
│ [   Hold for BLACKOUT   ]    │
├──────────────────────────────┤
│   ● Live        Calibrate    │
└──────────────────────────────┘
```

- **Primero, lo que está saliendo**: la franja NOW siempre visible, con el tiempo restante.
- **Rejilla o lista**: en un teléfono el deck se ve como rejilla de 2 columnas agrupada por columnas del show, o como
  lista (un clip por fila, estilo Mitti). Se elige y se recuerda en el dispositivo.
- **Protecciones**: bloqueo de pantalla (un deslizador para desbloquear; evita toques en el bolsillo); blackout con
  pulsación mantenida de 0,6 s; el master usa el fader sin tirador, con el valor grande.
- **Lo que el teléfono no hace**: importar medios, editar la rejilla, el Advanced Output, el ruteo de audio. Se ven
  en sólo lectura con «Edit on the computer».
- Las partes que cambian 30 veces por segundo (progreso) se actualizan en su sitio, sin reconstruir botones bajo el
  dedo: la regla que ya sigue `remote.js`.

### 7.3 Ancho de banda (el relé)

| Qué | Tamaño | Cuándo |
|---|---|---|
| Estado inicial + show | 10–40 kB | Al conectar |
| Miniaturas 160×90 | 4–8 kB cada una, ~200 kB por 30 clips | Una vez; caché permanente por huella |
| Cambio de transporte (`media`) | ~300 B | Por lanzamiento |
| Progreso | 0 | Se calcula en el teléfono con el reloj |
| Vista de la salida | ≤ 12 kB cada 2 s | **Sólo** con la tarjeta «Output preview» abierta; apagada por defecto por el relé |
| Vídeo, audio, PCM | — | **Nunca.** Las rutas de PCM rechazan todo lo que no sea este equipo |

### 7.4 El párrafo del contrato en `CLAUDE.md`

Sustituye a «**El teléfono es para calibrar; la app del ordenador es la app completa:** …»:

> **El teléfono es el mando de la sala; la app del ordenador es la app completa:** un dispositivo táctil abre el mando
> (`ui/js/remote.js`), no la aplicación entera. El mando tiene dos modos: **Live** (ver qué sale, lanzar clips y
> columnas de la rejilla, cargar la experiencia, volumen, blackout) y **Calibrate** (preparar, calibrar, ajustar con la
> mano, verificar). Importar medios, editar la rejilla, el Advanced Output, las zonas y el sistema se hace sólo en el
> ordenador. Por el relé de internet viajan estado, órdenes y miniaturas; **nunca vídeo ni audio**.

Además, en el mismo archivo: la primera línea de descripción menciona que la app es también el media server de la
sala; el Mapa añade `engine/media/`, `ui/js/mixer/`, `docs/plans/`; y la nota de licencias añade Raleway (OFL).

---

## 8. Fases

**Reglas para todas las fases**
- Como mucho **2 agentes Opus a la vez**. Las fases en paralelo tocan **archivos disjuntos** (lista por fase). Las
  tareas mecánicas marcadas *(Sonnet)* pueden ir a varios agentes Sonnet.
- **Cada cambio de comportamiento lleva su prueba, y la prueba tiene que saber fallar**: cada fase dice cómo.
- **Cuidado con el PC compartido** (Unreal Editor ocupa ~4,6 GB de RAM y parte de la GPU):
  - Mientras se desarrolla, ejecutar **sólo el archivo de pruebas de la fase** (`node --test tests/<archivo>.test.mjs`).
    `npm test` completo, una vez al cerrar la fase.
  - **Nunca dos agentes con pruebas de Electron a la vez**: el director da turno.
  - Los archivos de prueba son diminutos (256×32 px, ≤ 30 fotogramas, < 200 kB) y se generan; ningún medio en el repo.
  - Las medidas de rendimiento (F0, F13) se hacen con Unreal cerrado, o en el servidor de XR Lab a través de su agente.
  - Nunca matar procesos. Nunca dejar `npm start` ni el motor corriendo al terminar.
- El código nuevo del motor vive en `engine/media/`; `engine/engine.js` sólo reparte órdenes por prefijo. Así las
  fases que tocan el motor apenas coinciden en ese archivo de 77 kB.

### Orden y paralelismo

| Ronda | Agente A | Agente B |
|---|---|---|
| 1 | **F0** Medidas | **F1** Formato MOV / HAP / PCM |
| 2 | **F2** Biblioteca y show | **F3** Arquitectura de información |
| 3 | **F4** Transporte y presets | **F5** Mezclador GPU |
| 4 | **F6** Reproductor HAP | **F7** Audio de clips |
| 5 | **F8** Live en el escritorio | **F9** Advanced Output |
| 6 | **F10** Presets y `vt.media` | **F11** Mando: Live |
| 7 | **F12** Reel | **F13** Robustez y documentación |

---

### F0 · Medidas (decide el diseño del mezclador) — ∥ F1

**Objetivo:** convertir las estimaciones de §3.4 en medidas, antes de escribir el mezclador.
**Archivos:** sólo `docs/plans/MEDIA-SERVER-MEDIDAS.md`. El código de la sonda vive en el scratchpad de la sesión.
**Qué mide** (portátil con Unreal cerrado; repetir en el servidor de XR Lab):
1. Copia del lienzo de una experiencia a una textura WebGL2 a 7196×912: lienzo WebGPU y lienzo WebGL2, ms por fotograma.
2. Worker HAP portado tal cual, con un HAP sintético de 7196×912 (ruido suave, no negro): ms de lectura, Snappy y
   subida; fotogramas entregados por segundo y retraso, a 30 y 60 fps, HAP y HAP Q.
3. Ventana visible de 3840×2400 con Alma liquid + una capa HAP + slices: fps y huecos entre fotogramas en 60 s.
4. Lo mismo fuera de pantalla hacia Spout (el camino actual).

**Criterios:** el documento da las cifras y una decisión explícita: (a) mezclador como en §4.5; (b) si la copia WebGPU
cuesta más de 3 ms, fijar el renderer `webgl2` de Alma liquid cuando hay mezclador; (c) si ni así, plan B (R2).
**Pruebas:** ninguna (no entra código).

### F1 · Formato: MOV, HAP y PCM en Node — ∥ F0

**Archivos (nuevos):** `engine/media/mov.js`, `engine/media/hap.js`, `engine/media/pcm.js`, `engine/media/png.js`,
`engine/media/thumb.js`, `tests/fixtures/media/make-hap.mjs`, `tests/media-format.test.mjs`.
**Qué hace:** porta `movIndex` (+ pista de audio: `sowt/twos/in24/in32/fl32/fl64/lpcm`, `enda`, versiones 0/1/2 de la
descripción de sonido), `snappyDecompress`, `hapDecode`; decodificador DXT por bloques para miniaturas; PNG con
`node:zlib`; el generador de archivos de prueba (porte de `hapFrame` + `movBuild`).
**Criterios:** un `.mov` generado (HAP, HAP Alpha, HAP Q; con y sin trozos; con y sin audio) se indexa y decodifica en
Node; `probe(path)` devuelve vídeo, audio y un error con código para lo no admitido.
**Pruebas** (`tests/media-format.test.mjs`):
- El índice da el número de fotogramas, los instantes y las posiciones correctos. *Falla si* se rompe la tabla `stsc`
  (el generador escribe dos muestras por trozo en un caso).
- Snappy con fusión de rachas es idéntico byte a byte a una implementación ingenua incluida en la prueba.
- Un fotograma troceado decodifica igual que el mismo sin trocear.
- `HapM`, `Hap7`, `avc1`, archivo truncado → códigos `hapm:`, `not-supported:`, `not-hap:`, `no-moov:`.
- Audio: 16 LE, 16 BE, 24 bits y flotante devuelven las muestras esperadas (una rampa conocida). *Falla si* se
  confunde el orden de bytes.
- Miniatura: un fotograma con una marca roja arriba a la izquierda da un PNG con rojo arriba a la izquierda. *Falla
  si* se voltea.

### F2 · Biblioteca y show en el motor — ∥ F3

**Depende de:** F1.
**Archivos:** nuevos `engine/media/index.js` (`MediaEngine`), `engine/media/library.js`, `engine/media/import-worker.js`,
`engine/media/show.js`, `tests/media-library.test.mjs`, `tests/show.test.mjs`. Modifica `engine/store.js` (carpeta
`shows/`, `settings.mediaDir`), `engine/engine.js` (reparto `media.* / show.*`, `state`), `engine/server.js`
(`/api/media/thumb`, `/api/media/pcm`), `engine/profile.js` (`media`, `audio.media`).
**Qué hace:** §4d completo en el motor: validar, copiar en un hilo aparte con progreso y reanudación, huella,
miniaturas, medios que faltan y reubicar, `normalizeShow`, versiones del show.
**Criterios:** importar un archivo de prueba lo deja en la biblioteca con miniatura y el show lo referencia por ruta
relativa; mover la biblioteca y reubicar lo arregla; el bucle de 60 Hz no se resiente durante una copia.
**Pruebas:**
- Importar copia a `.part` y renombra; cancelar no deja restos. *Falla si* se copia directo al nombre final.
- **Origen que desaparece a mitad de copia** (un origen simulado que da error tras N bytes): estado `interrupted`,
  `.part` conservado; al reanudar, el archivo final es idéntico al original.
- Cada caso de la tabla de validación de §4d.3 da su mensaje exacto.
- Misma huella = no se copia dos veces.
- Sin espacio (umbral inyectado) se rechaza con las cifras.
- `normalizeShow`: ids únicos, celdas que apuntan a clips inexistentes se eliminan, un clip nuevo hereda los valores
  de su capa (el bug de Resolume de §2.2).
- `/api/media/pcm` responde en este equipo y se **rechaza** desde una dirección no local y por el túnel del relé.
- Mientras dura una copia grande simulada, el `tickMaxMs` del motor no supera el de reposo en más de 2 ms.

### F3 · Arquitectura de información de la app — ∥ F2

**Archivos:** `ui/index.html`, `ui/js/app.js`, `ui/js/views.js` (sólo mover y rotular), `ui/app.css`, nuevos
`ui/js/live/index.js` (pantalla Live vacía con el monitor), `ui/js/outputview/index.js` (subpestañas), `ui/css/live.css`,
`ui/css/screens.css` (vacíos, enlazados), `app/main-preload.cjs` + su alta en `app/main.js › createMainWindow` (rutas de
archivos soltados), `tests/ui.test.mjs`.
**Qué hace:** §4b.2 sin funciones nuevas: tres secciones, subpestañas, traslado de paneles, barra superior con
Problems y Blackout (aún sin efecto), redirecciones de los identificadores antiguos.
**Criterios:** todo lo que hoy se puede hacer se sigue pudiendo hacer, en su sitio nuevo; `tests/ui.test.mjs` pasa.
**Pruebas** (añadidas a `tests/ui.test.mjs`):
- Hay exactamente tres botones de sección y cada subpestaña pertenece a una. *Falla si* queda una pestaña suelta.
- `__vt.go()` con cada identificador antiguo abre la sección y la subpestaña correctas.
- Ninguna vista tiene un `input[type=range]` (se extiende el recuento existente a las vistas nuevas).
- En modo móvil sigue abriéndose el mando, no la app.

### F4 · Transporte y presets (motor) — ∥ F5

**Depende de:** F2.
**Archivos:** nuevos `engine/media/transport.js` (puro, con reloj inyectable), `engine/media/presets.js`,
`tests/transport.test.mjs`, `tests/presets.test.mjs`. Modifica `engine/media/index.js`, `engine/engine.js` (órdenes,
`LOCKED_OPS`, alias de `experience.*` y `sound.*`, `output.layers` con la capa opcional `media`), `engine/profile.js`
(capa `media` en `normRoomOutput`), `engine/server.js` (mensajes `media` y `mediaEvent`), `engine/experiences.js`
(`media` y `transparent` en el manifiesto), `tests/output.test.mjs` (la prueba de «las tres capas» pasa a cuatro).
**Qué hace:** §4.2 y §4.3: lanzar, columna, expulsar, finales, autopilot con compensación del fundido, toggle,
blackout, capa reservada, cargar y descargar preset, órdenes `audio.media`, instantánea para reinicios.
**Criterios:** el estado de transporte es función sólo de las órdenes y del reloj; con reloj falso la secuencia es
reproducible.
**Pruebas** (`tests/transport.test.mjs`, reloj falso):
- `loop`: la posición se pliega; `hold`: se queda en el último fotograma; `clear`: la capa queda vacía tras la
  transición; `bounce`: va y vuelve.
- `next` con `loops: 2` lanza el siguiente tras dos pasadas y **empieza antes** en la duración del fundido. *Falla si*
  el siguiente empieza al acabar el actual (habría un hueco).
- Columna: lanza todas las capas menos las de `ignoreColumn`.
- `toggle`: el segundo lanzamiento expulsa.
- Show mode: lanzar funciona, `show.update` y `media.import` se rechazan.
- Una edición del show con revisión vieja se rechaza.
- Instantánea: tras «reiniciar» el motor a mitad de un clip de 300 s, la posición restaurada difiere menos de 100 ms.
- Un clip cuyo archivo falta no cambia el transporte y devuelve un error a quien lo lanzó.
- `experience.play {id}` (API antigua) sigue funcionando y equivale a cargar el preset de esa experiencia.
- `output.layers` con las tres capas de siempre sigue siendo válido y no mueve la capa `media`.

### F5 · Mezclador GPU (aún sin vídeo) — ∥ F4

**Depende de:** F0.
**Archivos:** reescribe `ui/js/output.js`; nuevos `ui/js/mixer/gl.js`, `ui/js/mixer/layers.js`, `ui/js/clock.js`,
`tests/mixer.test.mjs`. Modifica `experiences/runtime.js` (`frameOut` en modo capa llama a `parent.__vtLayerFrame`),
`ui/output.html`, y las pruebas de salida de `tests/ui.test.mjs` que miran el DOM de la página (`tests/output.test.mjs`
es del motor y lo toca F4, no esta fase).
**Qué hace:** §4.5 para las capas que ya existen (experiencia, toques, rejilla, feedback), con sus blends y opacidades,
el modo calibración y la vista previa a 10 fps. La salida debe verse **igual que hoy**.
**Criterios:** Spout sigue recibiendo 7196×912 con los colores correctos (`tests/spout.test.mjs` sin cambios); la
calibración se ve como hoy; `window.__out` conserva `sync`, `layers()`, `stats`.
**Pruebas** (`tests/mixer.test.mjs`, ventana oculta de Electron, `readPixels`):
- Dos capas de color conocido con cada blend dan el píxel esperado (±2 niveles). *Falla si* se confunde screen con add.
- El orden de las capas cambia el resultado.
- La experiencia de prueba (`tests/fixtures/experiences/touch-probe`) llega al mezclador **no vacía** y sin voltear.
  *Falla si* la copia se hace fuera de la tarea del dibujo.
- Modo calibración: la experiencia no se dibuja y no se recarga al volver (su contador de arranques no cambia).
- La rejilla sólo se vuelve a subir cuando cambia algo (contador `stats.grid`).

### F6 · Reproductor HAP en la salida — ∥ F7

**Depende de:** F1, F4, F5.
**Archivos:** nuevos `ui/js/mixer/hap-worker.js`, `ui/js/mixer/hap-pool.js`, `ui/js/mixer/hap-player.js`,
`ui/js/mixer/media-layers.js`, `tests/hap-player.test.mjs`. Modifica `ui/js/output.js` (alta de las capas de clips),
`app/main.js` (`nodeIntegrationInWorker` en la ventana de salida; la ventana **no se cierra** al morir el motor),
`engine/server.js` (sirve `/shared/hap.js` y `/shared/mov.js`), `tests/ui/runner.cjs` (opción para workers con Node).
**Qué hace:** §3.1 portado; capas de clips con fundido, colocación (`place`), precarga, aparcado; informe de fotogramas
tarde al motor (`media.report`).
**Criterios:** un clip lanzado se ve en su capa en el fotograma que marca el reloj; el bucle no enseña un fotograma
viejo; al quitar un clip se libera su memoria.
**Pruebas** (`tests/hap-player.test.mjs`; el archivo de prueba lleva el número de fotograma codificado en una franja
de bloques de color y marcas de esquina):
- A un instante dado del reloj, el fotograma entregado es el esperado. *Falla si* el índice se desplaza en uno.
- Orientación: las marcas de esquina están en su sitio.
- En la vuelta de un bucle, el primer fotograma mostrado es el 0, no el último (la avería que cerró R401 en VEATION).
- Un fotograma que llega tarde pero es más nuevo que el mostrado **se enseña**; uno de una trayectoria anterior, no.
- Aparcar un reproductor cierra todos sus `ImageBitmap` (contador a cero).
- Archivo que desaparece mientras reproduce: la capa se expulsa, la página sigue viva y llega un `mediaEvent: error`.
- Fundido: a mitad de transición el píxel es la media de los dos clips.
- Parte pura del planificador (ventana de petición, latencia) probada en Node sin Electron.
- Guarda de navegación: la ventana de salida (la única con Node en sus workers) rechaza navegar fuera de nuestro
  servidor. *Falla si* se quita la guarda (en VEATION es la red `r400c-navegacion`, con control por reversión).

### F7 · Audio de clips — ∥ F6

**Depende de:** F2 (ruta PCM), F4 (órdenes `audio.media`), F5 (`clock.js`).
**Archivos:** nuevo `ui/js/audio-media.js`, `tests/audio-media.test.mjs`. Modifica `ui/js/audio-graph.js` (bus de
clips), `ui/js/audio-core.js` (`mediaRouting()`), `ui/js/audio-worklets.js` (`vt-media-player`), `ui/js/audio-host.js`
(sigue `state.media`), `tests/audio-ui.test.mjs`.
**Qué hace:** §4c completo.
**Criterios:** un clip estéreo suena en todos los canales de la sala según la tabla de XR Lab; el arranque y la
sincronía cumplen los objetivos; el limitador sigue mandando.
**Pruebas:**
- `mediaRouting()` con el mapa leído de `profiles/xrlab.json` da exactamente la tabla de §4c.3 (anchura 100 % y 0 %).
  *Falla si* un canal compartido suma en vez de tomar el máximo.
- 1 canal → todos los muros por igual; 4 canales en una sala de 4 muros → uno por muro; 5 → el quinto al sub (o
  repartido si no hay).
- Grafo en `OfflineAudioContext`: un tono sólo en L aparece en los canales 1, 2 y 3 con las ganancias esperadas.
- Un clip 10 veces demasiado alto queda bajo el techo (como la prueba equivalente de `sound-room.test.mjs`).
- Arranque: la muestra 0 cae a ±2 ms del instante pedido (anillo y worklet en la página aislada).
- Deriva: con un reloj simulado un 0,1 % rápido, el error de posición vuelve a < 5 ms y no hay salto.
- 44,1 kHz: un tono de 1 kHz sale a 1 kHz. *Falla si* no se remuestrea.
- Atenuación: mientras suena un clip con audio la pieza de sonido baja; al acabar, vuelve.
- El volumen y el mute de la capa actúan con rampa (sin escalón entre bloques).

### F8 · Live en el escritorio — ∥ F9

**Depende de:** F2, F3, F4 (y F6 para verlo en la sala).
**Archivos:** nuevos `ui/js/live/grid.js`, `ui/js/live/layers.js`, `ui/js/live/shelf.js`, `ui/js/live/inspector.js`,
`ui/js/live/library.js`, `ui/js/live/dnd.js`, `tests/live-ui.test.mjs`. Modifica `ui/js/live/index.js`,
`ui/css/live.css`, `ui/js/workspace.js` (el monitor enseña la vista previa de la salida).
**Qué hace:** §4b.3 y §4b.4: rejilla, decks, tira de capas, estantería, inspector, cajón de biblioteca con progreso,
arrastrar y soltar, Problems, teclado.
**Criterios:** el flujo «soltar un HAP en una celda → se ve copiando → lanzarlo → verlo en el monitor → expulsarlo»
funciona de principio a fin sin abrir ningún diálogo.
**Pruebas** (`tests/live-ui.test.mjs`, ventana oculta):
- Clic en la miniatura lanza; clic en el nombre sólo selecciona. *Falla si* seleccionar lanza.
- La cabecera de columna lanza la columna; la X expulsa la capa.
- Una celda viva tiene la clase de «vivo» y el indicador correcto (círculo o barra + tiempo) según su modo de final.
- Soltar un archivo no HAP enseña el mensaje de la tabla y no crea ninguna celda.
- Un medio que falta marca la celda y suma en Problems; *Locate…* lo arregla.
- Todos los valores numéricos son `fader()`; cero `input[type=range]`.
- Con Show mode, las celdas siguen lanzando y no se pueden arrastrar.

### F9 · Advanced Output — ∥ F8

**Depende de:** F3, F5.
**Archivos:** nuevos `ui/js/mixer/screens.js`, `ui/js/outputview/screens.js`, `ui/js/outputview/stage.js`,
`engine/media/screens.js` (plantillas, geometría), `tests/screens.test.mjs`. Modifica `engine/profile.js`
(`normScreens`, migración), `engine/engine.js` (`output.screens`, `output.testCard`, `outputWindow()` para `screens`),
`app/main.js` (ventana sobre una o varias pantallas, reencontrar la pantalla), `ui/js/output.js` (paso de slices),
`ui/css/screens.css`, `profiles/xrlab.json`, `profiles/xrlab-sim.json`, `tests/output.test.mjs`.
**Qué hace:** §5 completo.
**Criterios:** con el perfil de XR Lab y `sink: 'screens'`, cada muro sale 1:1 en su cuadrante; mover un slice mueve
la imagen; la rejilla de calibración atraviesa los slices.
**Pruebas** (`tests/screens.test.mjs`):
- Un perfil sin `screens` se normaliza sin cambiar `sink` ni las capas (la prueba compara con el perfil de antes).
- Plantilla Fx4 sobre XR Lab: 4 slices con los anchos 1912 / 1692 / 1920 / 1672 y alto 912, sin escalar.
- Geometría: un punto del lienzo cae en el píxel de pantalla esperado, en rect, corner pin y malla.
- Mezclador (`readPixels`): un color pintado en x = 2000 del lienzo (muro P1) aparece en el cuadrante de P1 y en
  ningún otro. *Falla si* los slices se cruzan.
- Una pantalla que no está conectada no abre ventana y aparece en Problems.
- Carta de ajuste: se dibuja encima de todo y no cambia el perfil.
- Flechas: 1 px y 10 px con Mayús.

### F10 · Presets de experiencia y `vt.media` — ∥ F11

**Depende de:** F4, F5, F6, F8.
**Archivos:** nuevos `tests/fixtures/experiences/media-probe/` (experiencia de prueba), `tests/runtime-media.test.mjs`.
Modifica `experiences/runtime.js` (`vt.media`, `vt.walls` con metros y máscaras), `ui/js/output.js` (cambio de
experiencia con imagen congelada, experiencia transparente encima), `ui/js/live/shelf.js` y `ui/js/live/inspector.js`
(ranuras de clips, parámetros), `engine/media/presets.js` (migración de `profile.experience`), `ui/js/expview.js`.
**Qué hace:** §4.4 y §4b.4.
**Criterios:** Alma liquid se carga desde su tarjeta y se ve como hoy; cambiar de tarjeta nunca deja la sala en negro;
una experiencia lanza un clip y recibe su `ended`.
**Pruebas:**
- La experiencia de prueba llama a `vt.media.play` y recibe `started` y `ended` con el `playId` correcto.
- Al descargar el preset, el clip que lanzó se para; los de la rejilla siguen (`keep`) o se expulsan (`clear`).
- Cambio de experiencia: entre la orden y el primer fotograma de la entrante, la salida **no es negra** (muestreo de
  píxeles). *Falla si* se quita la imagen congelada.
- Dos presets de la misma experiencia: cambiar entre ellos no recarga la página (contador de arranques).
- Una experiencia que no arranca en 5 s deja la anterior congelada y el preset en error.
- `vt.media` en modo autónomo y en el visor no lanza nada real.
- Migración: un perfil con `experience: { id: 'alma-fluid', params }` produce un preset con esos parámetros.

### F11 · Mando del teléfono: Live — ∥ F10

**Depende de:** F4, F8 (contratos de órdenes y miniaturas).
**Archivos:** nuevos `ui/js/remote-live.js`, `ui/css/remote-live.css`, `tests/remote-live.test.mjs`. Modifica
`ui/js/remote.js` (barra de modos; el modo Calibrate queda como está), `CLAUDE.md` (párrafo de §7.4),
`tests/cloud.test.mjs`.
**Qué hace:** §7 completo.
**Criterios:** desde un teléfono por el relé se ve qué sale, se lanza un clip, se carga un preset, se baja el master y
se hace blackout; nada de vídeo cruza el relé.
**Pruebas** (`--mobile`):
- El mando abre en Live con la sala en Show mode y en Calibrate con una sala sin calibrar.
- Un toque en una celda envía `clip.trigger`; la franja NOW refleja el cambio sin reconstruir los botones (el nodo del
  DOM es el mismo antes y después).
- Blackout exige mantener 0,6 s. *Falla si* un toque corto lo activa.
- Con el bloqueo de pantalla puesto, los toques no envían órdenes.
- Por el relé (`tests/cloud.test.mjs`, relé de Node): la miniatura llega; `/api/media/pcm` devuelve 403; el estado
  inicial con un show de 60 clips pesa menos de 64 kB.
- El modo Calibrate pasa todas sus pruebas actuales sin cambios.

### F12 · Experiencia Reel — ∥ F13

**Depende de:** F10.
**Archivos:** todo `experiences/reel/` (§6.6), `licenses/Raleway-OFL.txt`, `tests/reel.test.mjs`.
**Qué hace:** §6 completo.
**Criterios:** en la sala simulada, con manos virtuales: Play Reel reproduce y vuelve; See Projects enseña las amebas;
tocar una reproduce su vídeo y vuelve al menú; nada queda fuera de alcance ni sobre una puerta.
**Pruebas** (`tests/reel.test.mjs`):
- Máquina de estados: los caminos del diagrama de §6.1, incluido el regreso por inactividad.
- Un clip que falta: su objetivo no responde y los demás sí.
- `play` que no arranca en 3 s: se vuelve al estado anterior y se informa del error.
- Permanencia: 400 ms dentro no lanza, 500 ms sí; salir a mitad vacía el anillo.
- Costura: una mano en x = ancho − 5 px acierta un objetivo centrado en x = 10 px.
- Disposición con el perfil de XR Lab: todos los objetivos entre 0,9 y 1,7 m, ninguno sobre una máscara ni a menos de
  0,3 m de una esquina, sin solaparse. *Falla si* se coloca en fracción de muro en vez de en metros.
- Continuidad 360°: el fondo no tiene salto en la costura (la medida de la prueba de Alma liquid), en Electron.
- Mantener la mano 1,5 s durante un vídeo vuelve al menú; un toque de 300 ms no.

### F13 · Robustez, operación y documentación — ∥ F12

**Depende de:** F6, F7, F9.
**Archivos:** `engine/media/index.js` (arranque del show, vigilancia), `engine/engine.js`, `app/main.js` (recuperación
de la ventana de salida), `ARCHITECTURE.md`, `docs/OSC.md` (sección nueva, sólo añadidos), `docs/MANUAL-OPERACION.md`,
`README.md`, `tests/media-restart.test.mjs`.
**Qué hace:**
- La sala arranca sola: show, preset y columna de `show.start`.
- Reinicio del motor: la salida sigue; al volver, el transporte se restaura de la instantánea.
- Si el renderer de la salida muere, se reabre y los clips vuelven a su sitio por reloj en menos de 2 s.
- Chips de salud: fotogramas tarde por segundo, cortes de audio, disco de la biblioteca lento o lleno.
- Sesión larga: medir 8 h de reel en bucle en XR Lab (memoria, fotogramas tarde, deriva A/V). Se documenta el resultado.

**Pruebas** (`tests/media-restart.test.mjs`):
- Motor reiniciado a mitad de clip: el estado restaurado tiene el mismo clip y una posición coherente con el tiempo pasado.
- Al arrancar con un archivo que falta, la sala arranca igual, sin ese clip, y lo dice en Problems.
- `show.start` lanza lo que dice, y sólo al arrancar.
- La ventana de salida recibe el estado tras reconectar y no reinicia sus capas (contador de arranques).

### Tareas mecánicas *(Sonnet, en paralelo, cuando su fase esté cerrada)*

- Traducir a inglés los comentarios del código portado de VEATION.
- `scripts/check-syntax.mjs`: cubrir `engine/media/`, `ui/js/mixer/`, `ui/js/live/`, `experiences/reel/`.
- Capturas nuevas para `docs/MANUAL-OPERACION.md`.
- Importador de un preset de Advanced Output de Resolume (XML) a `output.screens`, **sólo si** Beltrán aporta su
  archivo: el formato no es público y hay que leerlo de un ejemplo real.
- Clips de demostración generados para la sala simulada.

---

## 9. Riesgos y cómo medirlos

| # | Riesgo | Cómo se mide | Qué se hace si sale mal |
|---|---|---|---|
| R1 | La copia del lienzo de la experiencia al mezclador es cara a 7196×912 | F0, punto 1 | Renderer `webgl2` para Alma liquid con mezclador (las dos versiones dibujan lo mismo; hay prueba). Si no basta, R2 |
| R2 | La ventana visible de 3840×2400 no mantiene 60 fps con experiencia + clip | F0, punto 3 | Plan B: composición fuera de pantalla como hoy + `sharedTexture` de Electron (existe en la 44.7 instalada) hacia una ventana que sólo dibuja slices. Cuesta un fotograma de retraso y pierde el enganche al vsync |
| R3 | HAP Q a 60 fps no cabe | F0, punto 2 | Entregar en HAP, o HAP Q a 30. El aviso de importación lo dice con cifras |
| R4 | Sincronía audio/vídeo: latencias de Dante + Q-SYS y de Fx4 + proyectores desconocidas | En la sala: vídeo a 240 fps de un clip con destello + clic (el método ya propuesto para toque→sonido). Ajustar `avOffsetMs` | El ajuste es por sala y queda en el perfil |
| R5 | Deriva en un reel de 5 minutos | F7 (simulada) y F13 (8 h reales) | La corrección por velocidad ya está en el diseño; si la tarjeta deriva más de 0,3 %, subir el margen |
| R6 | Workers con Node en la ventana de salida, que también aloja experiencias | La guarda `will-navigate` ya está en `applyOutputWindow`; F6 añade la prueba que falla si se quita | Si algún día se admiten experiencias de terceros, la experiencia pasa a un `iframe` con `sandbox` y los workers HAP a un origen aparte |
| R7 | PC compartido durante el desarrollo: memoria de vídeo y pruebas de Electron junto a Unreal | `nvidia-smi` antes de F0 y de las pruebas de F6 | Archivos de prueba diminutos; turnos para las pruebas de Electron; medidas pesadas en el servidor de XR Lab |
| R8 | Varias pantallas con escala o refresco distintos (4 salidas HD directas) | F9 en una máquina con dos monitores | Avisos en la interfaz; recomendar NVIDIA Mosaic; documentarlo en el manual |
| R9 | El usuario trae un vídeo que no es HAP | Tabla de validación (F2) | Mensaje claro. Mejora posterior: respaldo `<video>` para MP4 de hasta 4096 px de ancho, sin garantía de fotograma exacto |
| R10 | El lápiz se arranca a mitad | Pruebas de F2 y F6 | Ya diseñado: copia reanudable, expulsión limpia |
| R11 | La reorganización de la interfaz rompe costumbres y pruebas | `tests/ui.test.mjs` completo en F3 | Los identificadores de vista se conservan; F3 no añade funciones |
| R12 | El disco de la biblioteca es lento o está lleno | Medida al elegir la carpeta y al importar | Aviso con cifras; chip de salud |
| R13 | El motor (tope de 256 MB de heap) sirve PCM y miniaturas | `GET /api/health` durante una reproducción larga (F13) | El PCM son 0,2–1,5 MB/s en búferes fuera del heap; la copia va en otro hilo |
| R14 | Un clip a 25 fps en una salida a 60 Hz da cadencia irregular | Visual, en la sala | Limitación de la cadencia, no del software: recomendar 30 o 60 fps en el manual |
| R15 | Los perfiles guardados en el servidor de XR Lab no reciben la semilla nueva | — | El aviso al agente del servidor incluye los pasos: plantilla Fx4 y `sink: screens` desde Output › Screens |

---

## 10. Preguntas abiertas para Beltrán

Sólo las que bloquean una fase. Todo lo demás tiene un valor por defecto en este plan.

1. **Fx4 (bloquea la semilla de F9).** ¿Qué muro va en cada salida del Datapath Fx4 y en qué posición exacta queda
   cada recorte dentro de su cuadrante de 1920×1200 (arriba, centrado, con qué margen)? Lo más rápido: el archivo del
   preset de Advanced Output de Resolume que se usa hoy en la sala, o una captura de su etapa *Output Transformation*.
2. **Pantalla del operador (bloquea F9 y F13).** ¿El PC de la sala tiene un monitor para la app además de la salida
   de 3840×2400, o sólo la salida? Si sólo hay salida, la sala se maneja entera desde el teléfono y el arranque tiene
   que ser automático.
3. **El reel (bloquea las cifras de F0 y el aviso de F2).** ¿A cuántos fotogramas por segundo está, es HAP o HAP Q,
   y qué audio lleva (PCM o AAC, cuántos canales)? ¿En qué disco del servidor irá la biblioteca y cuánto espacio libre
   tiene? Un reel de 5 minutos ocupa entre 19 y 93 GB según la variante.
4. **Comportamiento de Reel (bloquea F12).** Dos decisiones con valor propuesto: (a) durante un vídeo, ¿se puede
   salir manteniendo la mano 1,5 s (propuesto) o siempre se reproduce hasta el final?; (b) en el menú, ¿cada muro lleva
   todas las amebas (propuesto) o un solo juego repartido por la sala?
