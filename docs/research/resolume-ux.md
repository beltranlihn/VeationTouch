# Resolume Arena 7 — análisis UX para rediseñar Live

Fecha: 2026-11-21. Objetivo: que Live (escritorio) se sienta tan resuelto como Resolume sin copiar su complejidad.
Complementa `docs/plans/MEDIA-SERVER.md` §2/§2b (estudio previo, más corto) y no lo sustituye.

**Fiabilidad de lo escrito sobre Resolume.** Cada afirmación lleva una etiqueta:
- `[manual]` = leído en la documentación oficial (resolume.com/support, artículos 9, 14, 15, 41, Media Manager, Layouts,
  Composition, Clip Time Panel, atajos) durante esta sesión.
- `[foro]` = hilos del foro oficial o notas de versión (7.7, 7.13, 7.21).
- `[memoria]` = conocimiento propio del programa que **no se pudo contrastar** con una fuente (las páginas de soporte
  que devolvía la herramienta eran índices sin contenido para Files, Transport, Dashboard). Hay que comprobarlo con la
  aplicación abierta antes de convertirlo en decisión. Las proporciones y tamaños son siempre `[memoria]`.

---

## A. Resolume Arena 7

### A.1 Ventana y sistema de paneles

Todo es un panel acoplable. `[manual]` Se pueden arrastrar para montar un layout propio, ocultar (clic derecho en la
barra del panel), desacoplar a otra ventana/pantalla y guardar en *View > Layout* (XML en `Documents\Resolume Arena\
Presets\Interface`). Si se arrastra un panel al borde de otro, una línea indica que irá al lado y no como pestaña.
`[foro]` Desde 7.6 los paneles se pueden desacoplar; desde 7.7 puede haber tantos monitores de preview como se quiera.

Disposición por defecto `[memoria]` (de arriba abajo):

```
┌ menú: File Composition Deck Layer Clip Output View Shortcuts ──────── BPM · tap · resync · CPU/GPU ┐
│ ┌ Dashboard ┐  ┌ Preview monitor ┐ ┌ Output monitor ┐   ┌ Panel de propiedades (pestañas) ┐        │
│ │ 8 knobs   │  │ (lo seleccionado)│ │ (lo que sale)  │   │ Composition │ Layer │ Clip       │ ~28 %  │
│ └───────────┘  └─────────────────┘ └────────────────┘   └──────────────────────────────────┘        │
│ ┌ Rejilla: [strip de capa][ clips … ][ clips … ] ───────────────────────────┐ ┌ Browser ────────┐    │
│ │ columnas arriba · capas = filas · master/crossfader a la derecha          │ │ Files│Sources│FX │ ~20% │
│ │ decks (pestañas) bajo la rejilla                                           │ │ (árbol+miniat.) │    │
│ └────────────────────────────────────────────────────────────────────────────┘ └─────────────────┘    │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Rejilla** (centro-bajo, ≈ 50-55 % del alto y ≈ 55-60 % del ancho): filas = capas, columnas = momentos. Es el único
  elemento que ocupa casi siempre toda la anchura disponible y el que más pesa visualmente.
- **Monitores**: *Output* = lo que sale; *Preview* = lo seleccionado, sin enviarlo. La rueda dentada de cada monitor elige
  qué muestra: Composición, Preview, Grupos, Capas, mezcla/A/B del crossfader, el clip/capa/grupo seleccionado o
  las Screens del Advanced Output. `[manual]` La 7.21 añadió un widget de transformación (mover/escalar/rotar) en el
  monitor `[foro]`.
- **Panel de propiedades**: tres pestañas Composition / Layer / Clip (más Group). Cambian solas al seleccionar (clic en el
  nombre del clip, de la capa o de la columna). Cada una trae sus secciones plegables: Common, Video, Audio, Transport,
  Transition, Effects. `[manual]` (Clip: codec, fps, duración, BPM por defecto; Resize Fill/Fit/Stretch/Original;
  blend propio; Alpha Type; Strip de audio o vídeo; Auto Pilot; volumen y pan del clip.)
- **Browser** (derecha, pestañas **Files**, **Sources**, **Effects**): Files es un explorador propio.
  `[manual]` Desplegable arriba con unidades y favoritos, **corazón** para guardar favoritos, interruptor de
  miniaturas, caja de búsqueda; el desplegable da acceso a Snapshots, Renders y Recordings. **Doble clic en un archivo =
  preview en el monitor** (sin sacarlo). Sources trae generadores (solid color, cámaras, NDI, plugins); Effects trae los efectos,
  con favoritos desde 7.7.
- **Dashboard** `[memoria]`: ocho parámetros asignables (al estilo de los 8 macro-mandos de Ableton) para tocar en
  directo cualquier parámetro sin abrir su panel. Es lo más «de DJ» de la interfaz y a la vez lo más prescindible para
  nosotros.
- **Clip Time panel** `[manual]` (7.13): reloj grande con la hora del sistema y el tiempo transcurrido o *restante* del
  clip (clic = alterna; resta con signo menos). Se coloca donde se quiera.
- Colores `[memoria]`: gris muy oscuro casi neutro, azul-celeste para selección y reproducción, naranja para el
  tempo, rojo para master ≠ 100 % (`[manual]`: el M del master «se muestra en rojo cuando no está al 100 %»).
  Tipografía pequeña (≈ 11 px), rótulos en minúscula-capital, densidad muy alta.

### A.2 La rejilla: composición, decks, capas, clips

- **Jerarquía** `[manual]`: Composición > Deck > Capa (fila) / Columna > Clip. Un deck es «un disco de la bolsa del DJ»:
  pestañas bajo las capas, con botones de scroll y un menú de hamburguesa que lista decks abiertos y cerrados.
  Decks: New (al final), Insert Before/After, duplicar, reordenar arrastrando, **Close** (se oculta pero conserva el
  contenido), Clear Clips, Remove, **color por deck**, y **el primer archivo suelto nombra el deck con el nombre de su
  carpeta**.
- **Clip persistente** `[manual]`: un clip marcado como *Persistent* aparece en el mismo hueco de todos los decks (con
  una miniatura pequeña del que cubre).
- **Columna**: la cabecera de columna (botón numerado arriba) lanza todos los clips de esa columna a la vez; hay flechas
  anterior/siguiente `[manual]`. `Ignore Column Trigger` por capa o por clip hace que un fondo no se toque.
- **Capa**: tira a la izquierda `[manual]` con **X** (expulsa el clip), **B** (bypass, «cegar»), **S** (solo), faders
  **V**ídeo / **A**udio / **M** (ambos), selector de **blend** (por defecto «Add» en capa) y opacidad; plegable con
  +/−; se selecciona haciendo clic en su nombre (queda resaltada en azul). Opcionales (menú View): **controles de
  transición de capa** (fader vertical 0–10 s; modo por defecto Alpha; flechas previous/next clip) y **controles de
  transporte de capa** (velocidad, dirección, loop mode, playhead). **A/B** asigna la capa al bus A o B del crossfader.
  *Clear Clips* vacía la capa; *Remove* la borra.
- **Grupos** de capas con su propia mezcla; fuera de nuestro alcance.
- **Composición** `[manual]`: **M** = visibilidad de todo lo que sale (rojo si ≠ 100 %); **S** = velocidad global (no
  afecta a lo sincronizado con BPM); crossfader con behaviour (Jump, Jump & Return, Cut, Fade) y curva; tamaño, fps y
  profundidad de color en Settings; volumen, pan y fade de vídeo maestros.
- **Tempo**: reloj BPM maestro (tap, resync, nudge) al que se pueden sincronizar clips y efectos.

### A.3 Aspecto y estado de un clip

Lo siguiente es `[memoria]` salvo donde se indica:

| Estado | Cómo se ve |
|---|---|
| Vacío | Casilla oscura plana, sin miniatura; sigue siendo destino de arrastre |
| Cargado | Miniatura 16:9 con el nombre en una franja debajo (el «name handle») |
| Seleccionado | Marco claro alrededor de la casilla; sale en el panel Clip. Se selecciona con **clic en el nombre** `[manual]` sin lanzar |
| Conectado / reproduciendo | La miniatura se ilumina y aparece una **línea vertical de playhead** que la recorre; el nombre cambia de color; en los clips que acaban se ve el avance |
| Conectado pero no visible | (capa en bypass o a 0 %) miniatura apagada |
| Color de clip | `[manual]` pastel opcional por clip o grupo: etiqueta de organización |
| Persistente | `[manual]` miniatura pequeña del clip al que cubre, arriba a la izquierda |

- **Lanzar** = clic en la miniatura `[manual]`. **Vista previa**: doble clic en el nombre = preview en el monitor
  `[manual]`. `[?]` No se encontró documentación de un «scrub al pasar el ratón por la miniatura»; no lo asumimos.
- **Estilo de disparo** `[manual]`: **Normal** (volver a pulsar reinicia), **Toggle** (on/off) y **Piano** (suena sólo mientras
  se mantiene pulsado ratón, tecla o nota MIDI). Se fija en la composición y se puede cambiar por clip. **Clip Target**:
  capa propia (por defecto), capa activa, capa libre. **Fader Start** reinicia al subir la opacidad de la capa. **Beat
  Snap** retrasa el inicio al siguiente pulso / compás / n compases.
- **Menú contextual de clip** `[manual]` (también Clip en la barra): Cut/Copy/Paste/Rename/Clear, Paste Effects,
  Show in Explorer, **Show in File Browser**, Strip Audio / Strip Video, Snapshot, Thumbnails (current frame, con
  efectos, desde disco, revertir), Clip Colors, Resize (Fill/Fit/Stretch/Original), Persistent, Auto Pilot, Trigger Style,
  Beat Snap, Clip Target, Fader Start, Ignore Column Trigger. Con **Shift/Ctrl-clic** se seleccionan varios y **cualquier
  cambio de menú o panel se aplica a todos a la vez** `[manual]`.
- **Auto Pilot** `[manual]`: al terminar el clip pasa al siguiente, anterior, aleatorio, primero, último o uno concreto;
  `Loops` = nº de vueltas antes de actuar; «Layer Determined» por defecto (herencia). Es la base de las listas.
- **Transport del clip** `[memoria]`: barra de tiempo con el playhead, **marcadores In / Out** arrastrables, botones de
  dirección (◀ ▶ ▶◀), modos Loop / Bounce / Random / Play once-hold, fader de **velocidad**, y selector **Timeline | BPM
  Sync | Position** (qué manda sobre el playhead). Se puede arrastrar el playhead (scrub) en caliente. El transporte de la
  capa repite lo mismo para el clip que suene.

### A.4 Gestión de medios

- **Cargar** `[manual]`: arrastrar archivos del explorador del sistema **o** de Files a un hueco; también doble clic en
  un deck guardado. Un audio y un vídeo soltados en el mismo hueco forman un clip audiovisual (el vídeo se estira a la
  duración del audio) `[manual]`.
- **Varios archivos a la vez** `[?]`: la documentación revisada no lo describe. En uso real ocupa huecos consecutivos de
  la fila `[memoria]`; mover un clip dentro de la rejilla sí está documentado: soltar *sobre* otro los **intercambia**,
  soltar *entre* dos los **inserta y desplaza** al resto `[manual]`; Ctrl (Opción) al soltar = copia; Ctrl+C/V/X funciona entre
  decks. El mismo clip puede aparecer varias veces `[manual]`.
- **Reemplazar** `[manual]`: arrastrar un vídeo del browser sobre el área azul de vídeo del panel Clip sustituye el
  contenido **conservando efectos y ajustes**; «Show in File Browser» ayuda a reemplazar conjuntos.
- **Medios perdidos** `[manual][foro]`: se pintan en **rojo** en la casilla con botón **Relocate**; abre el **Media
  Manager** (lista todos los archivos de la composición, ruta, estado). Al relocalizar uno busca los hermanos en
  posiciones relativas equivalentes y ofrece **Fix All / sólo éste**; *Locate All…* acepta una carpeta superior y busca
  en subcarpetas. **Collect Media** copia todo (nunca borra) a una carpeta con subcarpetas por deck y una copia de la
  composición con rutas actualizadas. Quejas en el foro: carpetas con `&` en el nombre, tamaños que no cuadran, rutas
  absolutas que no sobreviven a otra máquina.
- **Formatos** `[manual]`: acepta casi cualquier códec (vía FFmpeg/DirectShow/QuickTime según plataforma), imágenes,
  secuencias de imágenes `[foro]`, audio WAV (PCM sin comprimir recomendado, 44,1 kHz/16 bit; separado del vídeo para
  evitar problemas de bucle con audio embebido). Recomienda **DXV** (descompresión en GPU) y avisa de no instalar packs de
  códecs. **Alley** (gratis, viene con el instalador) convierte vídeos y secuencias de cualquier códec a DXV / ProRes /
  MJPEG arrastrando; las secuencias van en su propia subcarpeta `[foro]`. HAP funciona `[memoria]`.

### A.5 Atajos y mapeo

- Un **modo de edición de atajos** (Shift+Ctrl+K teclado, Shift+Ctrl+M MIDI, Esc para salir) `[manual]`: se pulsa el elemento
  y luego la tecla o la nota. Todo lo que se ve se puede mapear: clips, columnas, flechas de columna, bypass, faders.
  Teclado por defecto `[memoria]`: las filas QWERTY disparan clips de la capa 1 (Q-P), 2 (A-L), 3 (Z-M) y
  los números/F-keys disparan columnas. Existen también mapeo OSC y DMX.
- Fijos `[manual]`: Ctrl+Z / Ctrl+Y, Ctrl+K nuevo deck, Ctrl+L nueva capa, Ctrl+T nueva columna, Ctrl+Shift+D
  desactiva la salida, Ctrl+Shift+A Advanced Output, Ctrl+Shift+L carta de ajuste, Ctrl+Shift+P snapshot.

### A.6 Indicaciones visuales al arrastrar

`[memoria]`: la casilla destino se resalta con un marco, aparece una barra de inserción entre casillas al arrastrar
un clip (soltar «entre» = insertar), el cursor lleva una miniatura fantasma translúcida del clip arrastrado y, al
soltar sobre una casilla ocupada con un archivo del sistema, el contenido se **reemplaza**. En los decks, soltar un
archivo sobre la pestaña lo añade a ese deck.

### A.7 Por qué se lee bien en vivo

1. **La rejilla es la pantalla.** Todo lo demás es secundario y se puede plegar.
2. **Dos gestos separados: lanzar (miniatura) y seleccionar (nombre).** Se prepara sin sacar. `[manual]`
3. **El playhead dentro de la miniatura** responde «¿qué suena y cuánto lleva?» sin leer números.
4. **Jerarquía de herencia** (composición > capa > clip, «Layer Determined»): se configura una vez.
5. **Tiras de capa uniformes**: los controles de mezcla están siempre en el mismo sitio, a la izquierda.
6. **Densidad con jerarquía tonal**: casi todo en gris; el color sólo marca estado (lo que suena, lo seleccionado, lo
   perdido), de modo que el ojo va directo a lo importante.
7. **Selección múltiple con edición en bloque**: preparar 40 clips cuesta lo mismo que preparar uno.
8. **Todo mapeable**: el operador lo adapta a su mando.
Quejas habituales `[foro]`: pantalla recargada, el estado se lee mal de lejos, el relink es frágil.

### A.8 Advanced Output (resumen)

Lista de **Screens** y **Slices** a la izquierda, lienzo en el centro con pestañas **Input** (qué región de la composición
se coge) y **Output** (dónde se pone en la pantalla), números a la derecha; Edit Points, máscaras, soft edge, rejilla de
warp y *Device* (Display, Spout, NDI…). Nosotros ya lo cubrimos con **Output › Screens** (plan §5), así que no se trata aquí.

---

## B. Lista de huecos: nuestra UI frente a Resolume

Estado revisado: `ui/js/live/{index,grid,layers,shelf,inspector,library,dnd}.js`, `ui/css/live.css`, `ui/index.html`.
Hechos relevantes del código: monitor de altura `clamp(140px, 27vh, 320px)`; estantería de experiencias (tarjetas de 54 px);
rejilla de hasta 8 capas × 256 columnas con casillas **92–176 px de ancho** (miniatura 16:9 de **52–99 px de alto** + franja de
nombre de 22 px, `grid.js` `CW_MIN/CW_MAX`), cabecera de capa de 168 px; cajón de biblioteca **plegado por defecto** con
baldosas de 124 px; panel derecho fijo de **340 px** (400 px en táctil) con el inspector. El motor sólo acepta **`.mov` HAP**
(`isMovName`) y el transporte no tiene velocidad ni dirección (`engine/media/transport.js`).

Ordenados por impacto para un operador en vivo (1 = más grave). «Hecho» = ya existe y sólo se ajusta.

| # | Hueco | Resolume | Nosotros hoy | Impacto |
|---|---|---|---|---|
| 1 | **No hay navegador de archivos** | Files: árbol, unidades, favoritos, búsqueda, miniaturas, doble clic = preview | Sólo el cajón plegable con los archivos **del show**; no se puede mirar un USB ni una carpeta; todo entra arrastrando desde el explorador del SO (imposible sin ratón o desde el móvil) | Crítico |
| 2 | **El inspector del clip no tiene transporte** | Barra de tiempo con playhead, In/Out arrastrables, dirección, velocidad, modos de loop, scrub | In/Out son dos faders en segundos sobre `dur`; sin forma de onda ni fotogramas, sin ver qué región se reproduce, sin velocidad ni dirección, sin scrub | Crítico |
| 3 | **Casillas pequeñas y sin tamaño elegible** | Tamaño de miniatura configurable; nombre legible; línea de playhead dentro | 92-176 px de ancho: a 2 m el nombre (11 px, una línea cortada con «…») no se lee; sólo ocho columnas caben antes de hacer scroll horizontal | Alto |
| 4 | **Sin preview de lo seleccionado ni «skim»** | Monitor *Preview* independiente; doble clic en archivo/clip = preview sin sacarlo | Sólo una miniatura fija (un fotograma, 160/480 px) en el inspector; ni siquiera se puede elegir el fotograma de portada de un clip (existe `thumbFrame` en el medio, sin interfaz) | Alto |
| 5 | **Arrastrar y soltar es incompleto y puede destruir** | Insertar-y-desplazar, intercambiar, copiar con Ctrl, soltar sobre pestaña de deck, nombre del deck por carpeta | Un lote sobre una celda **sobrescribe sin avisar** las ocupadas (`importFiles` asigna `cells[...]`); no se puede soltar sobre una cabecera de columna ni sobre la pestaña de un deck ni sobre «+» (deck nuevo); no hay inserción entre casillas ni fantasma ni marcador del rango que se va a rellenar. *Hecho:* varios archivos rellenan columnas consecutivas; clip→clip intercambia; Ctrl/Alt copia | Alto |
| 6 | **Sin selección múltiple ni edición en bloque** | Shift/Ctrl-clic y cambios para todos; copiar/pegar clips | Se edita de uno en uno (`L.sel` es un único elemento); no hay copiar/pegar ni duplicar con Ctrl+C/V | Alto |
| 7 | **Teclado casi vacío** | Todo mapeable; filas QWERTY = clips; columnas = teclas | Sólo ←/→ (columna anterior/siguiente), Supr (expulsar capa) y Ctrl+Z. Decisión deliberada del plan («un accidente en una sala llena no vale un atajo») pero sin alternativa segura | Medio-Alto |
| 8 | **Formatos: sólo `.mov` HAP** | Cualquier códec, imágenes, secuencias, audio; Alley convierte | Todo lo demás se rechaza con un mensaje. Imágenes fijas y vídeo sueltos son lo primero que traerá un cliente | Alto |
| 9 | **Reemplazar un clip pierde ajustes** | Arrastrar sobre el área de vídeo conserva efectos/ajustes | Soltar un archivo sobre una celda ocupada crea un clip nuevo con los valores de la capa; no hay «Replace file…» en el inspector | Medio |
| 10 | **Tira de capa incompleta** | X, B, S, V/A/M, blend, A/B, transición, fold | Tiene X, nombre, M (mute de audio), B, Opacity y Volume. Faltan **Solo**, **blend en la tira** (está en el inspector), transición rápida y arrastrar para reordenar capas; el nombre de la capa no se edita en sitio | Medio |
| 11 | **Sin fader maestro de vídeo** | M de la composición (rojo si ≠ 100 %) | Sólo Master de audio y Blackout; no hay atenuador general de imagen, ni siquiera en el cajón | Medio |
| 12 | **El estado de una casilla se lee peor de lo que podría** | Línea de playhead que cruza la miniatura | Anillo de 22 px (bucle) o barra de 4 px abajo con el tiempo restante (11 px) — correcto, pero pequeño. Falta el nombre del clip que suena en la propia tira de la capa (hay que mirar la rejilla) | Medio |
| 13 | **Sin etiquetas de columna ni de color** | Colores de clip/deck; nombres de columna | Columnas sólo numeradas; sin color de clip; cada columna es un «momento del show» sin nombre | Medio |
| 14 | **El inspector es una columna larga** | Pestañas Clip/Video/Audio/Transport/FX; secciones plegables | Un clip abre: miniatura + 5 filas de datos + Playback (7 filas) + Placement + Audio + acciones en 340 px: hay que hacer scroll para llegar a «Remove» | Medio |
| 15 | **Medios perdidos: buen estado, mal arreglo** | Relocate en la casilla, Fix All, Locate All, Collect Media | Estado ámbar con «Missing» ✔ y «Locate…» que busca por nombre+tamaño+contenido ✔ (mejor que Resolume en robustez), pero hay que **teclear la ruta** de la carpeta (o soltarla); falta un selector de carpeta y un botón en la propia casilla | Medio |
| 16 | **La estantería de experiencias ocupa una fila entera** | (no existe) | 54 px + padding sobre la rejilla: es nuestra diferencia (no copiar), pero roba altura a las capas | Bajo |
| 17 | **Pestañas de deck pequeñas** | Pestañas bajo la rejilla, color por deck | Pestañas en `well` de 22 px; «+» de 22 px; sin color ni reordenar | Bajo |

Lo que ya está **por encima** de Resolume y se conserva: seleccionar≠lanzar con miniatura/nombre; ring/barra con tiempo
restante por tipo de clip; estado de copia por casilla; herencia «Layer default»; Locate por contenido; deshacer
(Ctrl+Z) sólo de ediciones; Show mode que bloquea ediciones; el mismo estado en el móvil.

---

## C. Propuesta de rediseño de Live (escritorio)

Principios: (1) **la rejilla es la pantalla**: todo lo demás se pliega; (2) estado por **posición y brillo**, el color
sólo para vivo (cian) y atención (ámbar); (3) **todo lo que se hace con el ratón se puede hacer con el dedo** (la app
también se usa en una pantalla táctil de la sala; objetivos ≥ 32 px en la rejilla); (4) nada nuevo de color ni de
control: `fader()` y `seg` de VEATION; (5) lo destructivo no se hace por accidente.

### C.1 Disposición y proporciones (referencia 1920×1080, ventana a pantalla completa)

```
┌ top 36 ─ Room ▾ ── ● ● ── Problems ───────────────────── [Blackout] [Show] [Connect] ┐
│nav│ MONITOR  alto clamp(140, 22vh, 260)  (más bajo que hoy: gana ~60 px para la rejilla) │
│64 ├────────────────────────────────────────────────────────────────────────┬─────────────┤
│   │ EXPERIENCES  44 px (tarjetas de 36 px de alto, sin subtítulo salvo hover) │ INSPECTOR   │
│   ├──────────┬─────────────────────────────────────────────────────────────┤ 360 px      │
│   │ BROWSER  │ GRID  (flex)                                                  │ pestañas:   │
│   │ 260 px   │ barra decks 32 · cabecera de columnas 36 · capas ≥ 96 px      │ Clip │ Layer│
│   │ plegable │ tira de capa 200 px a la izquierda, sticky                    │ Room        │
│   │ (tecla B)│                                                               │             │
│   │          ├─────────────────────────────────────────────────────────────┤             │
│   │          │ BARRA INFERIOR 36: copias · Master vídeo · Master audio · Mute │             │
└───┴──────────┴─────────────────────────────────────────────────────────────┴─────────────┘
```

- **Proporciones**: monitor ≈ 20-24 % del alto; shelf 4 %; rejilla ≈ 55-60 %; inferior 3-4 %.
  Ancho: browser 260 (≈ 13 %) · rejilla flex (≈ 66-68 %) · inspector 360 (≈ 19 %). El browser se pliega a 0 y la rejilla
  gana su ancho; el inspector no se pliega, pero con «nada seleccionado» muestra la tarjeta viva (como hoy).
- El **cajón de biblioteca actual desaparece**: sus funciones (copias, master, mute) pasan a la barra inferior y a la
  pestaña *Media* del browser.
- **Pantalla táctil de sala** (≥ 1280 px y `pointer: coarse`): el browser arranca plegado y las casillas suben a talla L.
  El móvil sigue con su mando (`remote.js`); no se tocan en esta propuesta.

### C.2 Browser (sustituye al cajón)

Pestañas **Media | Experiences** (esta última para no depender de la estantería en pantallas pequeñas).

**Media** tiene dos modos con un seg `Show | Disk`:
- **Show**: los archivos del show en lista o rejilla (interruptor), miniatura 16:9 de 88 px, nombre, duración, y un
  contador «en la rejilla: 2» o una marca «sin usar» en ink-3 (para limpiar). Búsqueda y orden (nombre / reciente /
  sin usar). Doble clic = preview en el inspector (C.6). Arrastrable a celdas, a cabeceras, a decks.
- **Disk** (solo en el equipo de la sala; `state.local`): árbol de carpetas con raíces *Library*, unidades conectadas
  (D:, E:… incluye el USB), *Desktop* y favoritos (★, persistidos en el perfil de usuario). Muestra sólo `.mov` HAP y carpetas
  (los demás archivos, atenuados con motivo en el *tooltip*). Doble clic en un archivo = preview; **arrastrar a la rejilla
  copia a la biblioteca como hoy** (§4d.2). Requiere dos comandos del motor: `fs.roots` y `fs.list {dir}` (sólo local, sólo
  lectura, ruta absoluta validada).
- Pie: espacio libre de la biblioteca y copias en curso (lo que hoy hace la barra del cajón).

### C.3 Reglas de arrastrar y soltar

Regla general: **nunca se sobrescribe lo que ya hay sin que se vea antes**. Mientras se arrastra, un contorno de ink dibuja
el **rango exacto** que se rellenaría, y las casillas ocupadas dentro del rango se tachan en ámbar.

| Origen → destino | Resultado |
|---|---|
| 1 archivo → celda vacía | Clip nuevo ahí |
| 1 archivo → celda **ocupada** | **Reemplaza el archivo del clip y conserva sus ajustes** (In/Out recortan si el nuevo es más corto; aviso). Ctrl = clip nuevo al lado |
| N archivos → celda | Rellenan N celdas **libres consecutivas** de esa capa desde la soltada; las ocupadas **se saltan** (no se pisan); los que no caben se quedan en la biblioteca con aviso «3 sin hueco» |
| N archivos → cabecera de **columna** | Uno por capa, de la capa superior hacia abajo, en esa columna (una «escena» de una vez) |
| N archivos → **cabecera de capa** | Primeras columnas libres de esa capa (ya existe) |
| archivos → **pestaña de deck** | Primeras celdas libres de la capa 1 de ese deck |
| archivos o carpeta → **«+» de deck** | Deck nuevo; **nombre = nombre de la carpeta** (como Resolume); un archivo por columna en la capa 1 |
| clip → celda ocupada | Intercambian (hoy) |
| clip → **entre** dos celdas (zona de 12 px entre ellas) | Inserta y desplaza el resto de la capa hacia la derecha |
| Ctrl/Alt al soltar | Copia (hoy) |
| clip → cabecera de capa o fuera | Nada; cursor «no permitido» |
| Show mode | Nada se arrastra (hoy) |

Indicaciones: el cursor lleva una **miniatura fantasma** (`setDragImage` con la miniatura de 96 px al 70 %); barra de inserción de 3 px
en ink entre las casillas; destino con borde `ink` (no cian: el cian es «vivo»); el informe de rechazados sigue siendo
un solo panel (`report()` ya está bien resuelto). Con **varias selecciones** (C.7) se arrastra el conjunto.

### C.4 Casilla (slot)

Tres tallas conmutables **S / M / L** (seg en la barra del grid, se recuerda por dispositivo):

| Talla | Ancho | Miniatura 16:9 | Franja de nombre |
|---|---|---|---|
| S | 104 px | 58 px | 1 línea, 18 px |
| M (por defecto) | 144 px | 81 px | 1 línea, 22 px |
| L (táctil / lectura a 2 m) | 208 px | 117 px | 2 líneas, 40 px |

- **Lanzar** = clic/toque en la **miniatura**; **seleccionar** = clic en el **nombre**. Se mantiene (bien resuelto).
  Añadir: toque en cualquier parte de una casilla en un dispositivo `pointer: coarse` **selecciona**, y la miniatura
  lanza sólo en su mitad superior (evita lanzar sin querer al desplazarse).
- **Estados** (todos con la misma geometría; sólo cambia brillo/color):

| Estado | Borde | Interior |
|---|---|---|
| Vacía | guiones ink-5 | «+» tenue sólo en hover/táctil; vacía no ocupa menos |
| Cargada | .5 px blanco 8 % | miniatura |
| Seleccionada | 1 px ink + 1 px de sombra | — (ink, nunca acento) |
| **Viva** | 1.5 px cian + halo | **línea de playhead** vertical cian de 2 px que cruza la miniatura (en bucles, vuelve al inicio; sustituye al anillo) + tiempo restante en el ángulo + fila de la capa con borde cian (hoy) |
| Saliendo (fade) | cian a guiones | la miniatura baja al 60 % |
| Conectada/lista | punto en el ángulo | (reserva: precargada, de VDMX) |
| Copiando | gris | banda de progreso (hoy) |
| Perdida / problema | ámbar | miniatura en gris + «Missing» y **botón «Locate…»** en la propia casilla (no sólo en el inspector) |

- **Hover (ratón)**: *skim* — al mover el cursor por la miniatura se enseñan los fotogramas del clip según la x (ver
  filmstrip en C.6; sin descodificar vídeo en el navegador); un clic lanza el clip desde el principio, **no desde el
  fotograma enseñado**. Retraso de 250 ms para que no parpadee al cruzar la rejilla. No existe en Resolume `[?]`: es una
  mejora nuestra y barata, pero es de prioridad «después».
- **Menú contextual** (clic derecho / pulsación larga en táctil): *Launch · Select · Rename… · Replace file… · Duplicate ·
  Copy · Paste · Cut · Show in browser · Set cover frame · Remove from grid · Remove file…* con atajo a la derecha.
  Y para la cabecera de columna (hoy: lanzar, START): añadir *Rename column… · Insert column · Delete column*.
- **Color de clip** (etiqueta de 3 px en el borde izquierdo, 8 colores neutros desaturados tomados de la paleta de ink,
  no acentos) — después.
- **Nombre de columna** editable bajo el número (hasta 10 caracteres), p. ej. «Intro», «Agua» — después.

### C.5 Tira de capa (200 px, sticky)

Hoy 168 px con 2 faders. Propuesta, dos filas de 32 px más la fila de faders:

```
┌ ▌ ✕   Layer 2 ▾           S  M  B ┐   (✕ eject, nombre = select, doble clic = renombrar; S solo, M mute audio, B bypass)
│   ▶ Reel_intro.mov   −0:12        │   (qué suena y cuánto queda; vacío = «—»)
│   Opacity ▬▬▬▬▬▬ 100 %            │   (fader())
│   Blend  Normal ▾  Trans 0.5 s    │   (blend en el menú; transición = campo s0)
└───────────────────────────────────┘
```
- **Solo (S)** nuevo: ámbar mientras esté activo (atención), igual que M y B. Si Solo y Bypass coinciden en la misma capa se
  avisa (el manual de Resolume lo advierte: te quedas sin imagen).
- **Volume** pasa a la pestaña *Layer* del inspector (el audio de clips no cambia en directo con tanta frecuencia); en la tira
  queda sólo la opacidad: la tira gana aire y las casillas pueden ser más altas.
- **Reordenar capas**: arrastrar por el nombre; el orden (arriba = encima) se respeta.
- **Fila inferior «Experience clips»** se mantiene tal cual.
- **Master vídeo** (nuevo): fader en la barra inferior, rojo-ámbar (ámbar) si ≠ 100 %, igual que el M de Resolume; el
  Blackout sigue siendo el interruptor binario. Requiere `media.master` en el motor y en el mezclador.

### C.6 Panel Clip (inspector con pestañas)

Arriba (fijo): miniatura de 480 px **16:9 con el filmstrip debajo**, nombre, [Launch]/[Restart], etiqueta LIVE.

```
┌ Reel_intro                         ▶ Launch ┐
│ ┌────────────────────────────────────────┐ │
│ │ miniatura (skim con el ratón por ella) │ │
│ └────────────────────────────────────────┘ │
│ ▕▏▕▏▕▏▕▏▕▏▕▏▕▏▕▏▕▏▕▏▕▏▕▏  filmstrip         │
│ [◀|=========[ In ──── playhead ──── Out ]==|▶] 0:00.0 – 0:14.2 · −0:09                       │
│  End: [Loop | Hold | Eject | Bounce | Next…]   ◀ ▶ ▶◀  Speed ▬▬ 1.00×                     │
├ Clip │ Placement │ Audio │ File ──────────────┤
```

- **Barra de transporte** (nueva): filmstrip de 12-16 fotogramas generado en la importación (el trabajador ya descodifica
  fotogramas para las miniaturas: `thumbnailImages`), con **asas In/Out arrastrables** (y sus campos numéricos con `fader()`
  como hoy para precisión), el playhead vivo mientras el clip suena (calculado con `playhead()` de `transport.js`, como
  ahora) y **clic para saltar** (scrub) en ese clip si es el vivo. La región fuera de In/Out se oscurece.
- **Modos de final** como `seg` de iconos-texto: *Loop · Hold · Eject · Bounce · Next* en lugar del `<select>` de 8 entradas
  largas; «Layer default» pasa a ser una marca pequeña sobre el seg («· layer») y un clic en ella restablece.
- **Dirección y velocidad**: ◀ ▶ y fader `0.25×–4×`; requieren cambios en `engine/media/transport.js` (hoy no hay
  `speed` ni `direction`), en `shared/transport.js` (`playhead()` es la fórmula única) y en el reproductor HAP. Es lo más caro
  de este bloque: va a «después» salvo la dirección.
- **Pestañas**: *Clip* (final, loops, In/Out, transición, lanzamiento) · *Placement* (fit, dónde) · *Audio* (ruta,
  ganancia) · *File* (datos, estado, Replace file…, Show in browser, Remove). Cada una cabe sin scroll en 1080p.
- **Replace file…** en *File*: botón + soltar archivo sobre la miniatura (misma regla que C.3).
- **Selección múltiple** (Shift/Ctrl-clic en el nombre): el inspector muestra «3 clips» y sólo los campos comunes; un campo
  tocado se aplica a todos (Resolume lo hace igual) — `L.sel` pasa a lista; la mayoría de las ediciones ya van por
  `L.editShow`, que acepta mutar varios clips en un único `show.update`.

### C.7 Teclado

Principio del plan que se mantiene: **nada destructivo ni de blackout con una sola tecla**. Se añade un **modo «Keys»**
armado explícitamente (interruptor «Keys» en la barra de la rejilla, ámbar mientras está armado, se desarma solo a los 10
minutos de inactividad):

| Tecla | Acción |
|---|---|
| `1`-`9`, `0` | Lanza la columna 1…10 del deck (sólo con Keys armado) |
| `Q W E R T Y U I` | Lanza el clip de la capa superior en las columnas 1-8 (con Keys) |
| `A S D F G H J K` | …de la segunda capa; `Z X C V B N M ,` la tercera |
| `←` `→` | Columna anterior / siguiente (hoy, siempre activo) |
| `↑` `↓` | Mueve la selección entre capas |
| `Intro` (seleccionado) | Lanzar el clip seleccionado |
| `Espacio` | Lanzar / reiniciar lo seleccionado (sólo con Keys); **no** blackout |
| `Supr` | Expulsar la capa seleccionada (hoy) |
| `Ctrl+C / V / X / D` | Copiar / pegar / cortar / duplicar clips seleccionados |
| `Ctrl+A` | Selecciona todos los clips del deck |
| `Ctrl+Shift+←/→` | Deck anterior / siguiente |
| `Ctrl+Z / Ctrl+Y` | Deshacer / rehacer (rehacer falta) |
| `B` | Plegar / abrir el browser |
| `F2` | Renombrar lo seleccionado |

Los rótulos de tecla se dibujan en la esquina de cada casilla cuando Keys está armado (como los rótulos de Mac en Ableton).

### C.8 Prioridades

**Imprescindible para la próxima prueba en sala** (impacto alto, riesgo bajo, todo en `ui/js/live/`, salvo lo marcado):

1. **Casillas más grandes, tallas S/M/L** y línea de playhead dentro de la miniatura (sustituye anillo y barra) (huecos 3, 12).
2. **Browser en lugar del cajón**, siempre abierto a 260 px, con búsqueda, miniaturas mayores, «en la rejilla: n», doble
   clic = preview. Modo *Disk* con árbol de carpetas y USB (necesita `fs.roots` / `fs.list`) (hueco 1).
3. **Reglas de arrastrar** de C.3: rango visible, no pisar celdas ocupadas, soltar sobre cabecera de columna y sobre «+» de
   deck (nombre por carpeta), fantasma y barra de inserción (hueco 5). Es lo que hoy puede **perder trabajo** al soltar.
4. **Reemplazar archivo conservando ajustes** + botón «Locate…» en la propia casilla perdida con selector de carpeta del
   sistema (Electron `dialog.showOpenDialog` desde `main-preload.cjs`) (huecos 9, 15).
5. **Panel Clip con pestañas y transporte**: seg de final, asas In/Out sobre un filmstrip, playhead en vivo y clic para saltar.
   Sin velocidad todavía (hueco 2, 14).
6. **Formatos**: aceptar imágenes fijas (PNG/JPG) como clip de duración fija. Sólo PNG/JPG porque el mezclador ya trata texturas;
   el resto sigue en HAP y el mensaje de rechazo apunta a un preset de FFmpeg/Alley y a `docs/` (hueco 8).
7. **Selección múltiple y edición en bloque** + Ctrl+C/V/D (hueco 6).
8. **Master de vídeo** y **Solo** en la tira de capa (huecos 10, 11).

**Después**:
- Velocidad y dirección del clip (transporte del motor y del reproductor); modos Random/Piano.
- *Skim* al pasar el ratón por las miniaturas (necesita el filmstrip, ya generado para el punto 5); portada elegible («Set cover frame»).
- Modo de teclas «Keys» (C.7) y rehacer.
- Colores de clip y de deck, nombres de columna, reordenar capas y decks arrastrando, deck cerrado (ocultar sin borrar).
- Importar secuencias de imágenes, un convertidor integrado (la idea de Alley: arrastrar y convertir a HAP con FFmpeg empaquetado → **licencia
  a revisar**: FFmpeg es LGPL/GPL según compilación; el contrato del proyecto prohíbe GPL/LGPL empaquetados, así que sólo como herramienta que el
  cliente instala).
- *Collect Media* (el export del show ya copia a una carpeta; falta la interfaz).
- Clip persistente (útil para un fondo común a todos los decks).

---

## D. Qué NO copiar

Resolume sirve a un VJ que toca en directo con efectos y música; aquí hay un operador de sala con un teléfono y una sala
inmersiva. Lo siguiente sobra o perjudica:

1. **Dashboard de 8 parámetros.** Es una consola de DJ. Nuestro equivalente son los parámetros de la experiencia viva (ya
   están en el inspector, con faders) y la tira de capa.
2. **Efectos, Sources y Wire.** Nada de cadenas de efectos por clip, generadores ni nodos: las «fuentes» son las
   experiencias y la mezcla es la de la sala. Es exactamente lo que el plan descartó (§2b.3-1) y lo que más ensucia Resolume.
3. **BPM, tap tempo, Beat Snap, BPM Sync y SMPTE.** No hay música que sincronizar con la rejilla; el tiempo del clip basta. El
   audio de clips ya tiene su propio transporte.
4. **Crossfader A/B y buses de capa.** Dos botones por capa y un fader que casi nadie en una sala usa; el cambio de escena
   se hace por **columna** con transición de capa (que ya tenemos).
5. **Interfaz de paneles libres y guardado de layouts.** Es muy potente y muy cara de mantener y de probar. Nosotros damos tres
   zonas fijas con tamaños sensatos y plegables; un operador novato no debe poder «perder» un panel.
6. **Grupos de capas anidados, transformaciones por clip con un widget de transformación en el monitor y máscaras.** El mapeo
   a pantallas ya vive en *Output › Screens*; mezclar eso con Live es lo que hace difícil a Resolume.
7. **Todo mapeable con MIDI/OSC por hacer clic.** Un editor de atajos general no merece la pena; sí unos pocos
   atajos fijos y el modo «Keys». El OSC de salida ya cubre el mando externo (`docs/OSC.md`).
8. **Mismo clip en varias casillas con datos distintos en cada una.** En Resolume la duplicación es barata y a veces confusa.
   Aquí «Duplicate» copia el clip y deja claro de quién son los ajustes (ya implementado así en `dnd.js`).
9. **Densidad extrema (11 px, 6 filas por casilla).** Para una sala se lee de pie y a 2 m: mejor menos casillas legibles que
   muchas diminutas. Por eso la talla M (144 px) es la base y la S es la excepción.
10. **Aceptar cualquier códec «y ya se verá».** Resolume lo hace y se paga con tirones, packs de códecs y relinks que
    fallan. HAP (más imágenes fijas) mantiene la promesa de 60 fps en el mezclador y un mensaje de error claro.
11. **Rutas absolutas en la composición.** Se queja todo el mundo; nuestra decisión de **copiar siempre a la biblioteca**
    (§4d.2) es mejor y se mantiene.

---

## E. Notas de método y huecos de la investigación

- No se pudo comprobar con una fuente: el tamaño por defecto de las casillas de Resolume, la existencia de «scrub al pasar
  el ratón», el comportamiento exacto de **varios archivos soltados a la vez** (huecos consecutivos), el reparto exacto de los
  paneles por defecto, la asignación de teclas por defecto y los controles exactos del transporte del clip. Todo eso va como
  `[memoria]`; antes de fijar medidas conviene abrir Arena 7 (hay versión de prueba gratuita) y medir.
- No se ejecutó el motor ni se hicieron capturas: el análisis de nuestra UI es de código y CSS.
- Fuentes consultadas: documentación oficial de Resolume (resolume.com/article/9, /14, /15, /41; support/en/media-manager,
  /layouts, /composition, /clip-time-panel, /shortcuts, /7/clips), entradas del blog de versión 7.7/7.13/7.21 y hilos del
  foro sobre Media Manager y Alley.
