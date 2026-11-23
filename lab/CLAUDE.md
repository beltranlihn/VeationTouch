# VEATION Touch Lab — contrato del Claude de Vicente (leer siempre)

Este es el **laboratorio de experiencias** de Alma Digital Studio. Vicente (socio del director creativo, Beltrán) crea aquí
experiencias interactivas y demos para las salas inmersivas con VEATION Touch, trabajando contigo (Claude Code). **Vicente no
desarrolla ni modifica el software.** Su misión es crear obras y construir un **catálogo de experimentos** que el estudio integra
después en el software y en el perfil de la sala. Tu trabajo es ayudarle a hacerlas bellas, correctas a escala humana y listas para
integrar.

Los contratos del proyecto (`CLAUDE.md` de la raíz, `ARCHITECTURE.md`) siguen vigentes; este archivo los resume para el laboratorio
y añade las reglas del laboratorio. Si algo de aquí contradice a la raíz, manda la raíz.

## 1. Misión y límites

- **Sólo se escribe dentro de `lab/`.** Nunca se toca `engine/`, `ui/`, `app/`, `cloud/`, `experiences/`, `tests/`, `profiles/`,
  `docs/`, `ARCHITECTURE.md`, `package.json` ni nada fuera de `lab/`. Si una tarea parece pedirlo, no lo hagas: explícalo a Vicente.
- **Si falta algo en el runtime** (una función de `vt`, un parámetro, un dato de la sala, un tipo de manifiesto), **no lo parchees ni lo
  imites**: escribe una petición en la sección *Requests to the studio* del `NOTES.md` del experimento (qué falta, para qué, qué
  harías con ello). El estudio decide. Mientras, haz el experimento con lo que existe o con un apaño local claramente marcado.
- **El arnés del laboratorio** (`lab/harness/`, `lab/tools/`) sí es tuyo y puedes mejorarlo, pero mantenlo pequeño, sin dependencias
  y **sin prometer nada que la app no tenga**: un experimento que sólo funciona en el arnés no vale. Cuéntaselo a Vicente cuando lo
  cambies.
- **Idioma.** El chat con Vicente, `README.md`, `CLAUDE.md` y `CATALOG.md`, en **castellano neutro** (sin voseo). Los `NOTES.md` de cada
  experimento, en **inglés** (el estudio los lee para integrar y sus textos acaban en manifiestos). El **código** (identificadores,
  comentarios de código) en inglés. **Todo texto que se muestre dentro de una experiencia (en pantalla,
  en parámetros, en el manifiesto) es SÓLO en inglés**, igual que el software.
- **Licencias.** Sólo dependencias MIT / BSD / Apache / ISC; nada GPL ni LGPL. Preferible cero dependencias: la sala funciona
  **sin internet** (nada de CDN, nada de `fetch` externo, tipografías autoalojadas o del sistema). Si traes una librería, va dentro
  de la carpeta del experimento con su licencia (`LICENSE-<nombre>.txt`) y se anota en el `NOTES.md`.
- **Nada de `prompt/alert/confirm`** (Electron no los soporta).
- **Sonido:** sólo síntesis Web Audio propia. **Sin samples**, sin archivos de audio, sin librerías de audio de terceros.
- **Secretos y medios pesados:** nunca se commitean secretos; nada de archivos de más de 20 MB (ver §12).

## 2. Cómo funciona el sistema (para un artista)

```
 la sala ──▶ LiDAR ──▶ toques ──▶ runtime ──▶ tu experiencia ──▶ salida ──▶ muros
 (4 muros)  (S2E ×4)   (manos)    (vt)         (una página web)    Spout /    (proyección
                                                                    pantallas   LED)
                                                      └──────▶ audio (síntesis) ──▶ altavoces 4.1
```

1. **La sala.** Barcelona XR Lab: 4 muros que cierran 360°. Cada muro tiene un sensor **Slamtec RPLIDAR S2E** (láser 2D) que
   barre un plano paralelo al muro, a pocos cm de él. Si una mano entra en ese plano, es un toque. **Son manos cerca del muro, no
   presión**: no hay "fuerza", ni multitoque de dedos, ni toques de menos de ~0,2 s fiables.
2. **El motor** (VEATION Touch) lee los sensores a ~10 Hz, calibra, hace seguimiento y entrega **toques en metros sobre cada muro**.
   Un toque tiene un `id` de rastreador que puede cambiar si el sensor pierde la mano un instante: por eso el runtime entrega
   **trazos (strokes)** estables.
3. **El runtime** (`experiences/runtime.js`, es lo único que importa tu página) convierte los toques en **manos** sobre un lienzo
   de píxeles, con *playback* suave (150 ms de retraso a propósito) y cosiendo los cortes del sensor.
4. **Una experiencia** es una **página web** (HTML + JS, normalmente WebGL2) que dibuja en ese lienzo y escucha manos. La app la
   carga en la sala, la saca por **Spout** (a TouchDesigner, Resolume…) o la muestra en las pantallas; también se ve en la tira
   *Live* y en la vista 3D de la app (una **segunda instancia** de baja resolución: tu página corre dos veces).
5. **El audio** lo hace una pieza **de sonido** aparte (`kind: "sound"`), un módulo JS que sólo emite sonido; la app es dueña de
   los dispositivos, el reparto por muros, el sub, el volumen y el limitador. Sonido y visual se emparejan en un *preset*.
6. **El media server** (la app es también el media server de la sala): reproduce **clips HAP** en una rejilla de capas y columnas,
   con presets de experiencia y audio de los clips por los altavoces. Tu experiencia puede declarar **huecos de clips** (*slots*)
   en el manifiesto y lanzarlos con `vt.media` (§4.6). El operador asigna los clips en *Live*. **El laboratorio no lleva vídeo**.
7. **Una experiencia, en una frase:** una carpeta con `manifest.json` (nombre, parámetros, huecos de clips) y una página (visual) o un
   módulo (sonido) que usa `vt`.

El teléfono del operador dentro de la sala es el mando (lanzar clips, cargar experiencias, volumen, blackout); todo lo demás se hace en
el ordenador. Nada de eso afecta a tu experimento, salvo que **debe poder operarse sin teclado ni ratón**: la experiencia sólo se
maneja con manos y con parámetros del manifiesto.

## 3. La sala en números (Barcelona XR Lab)

Los números viven en `profiles/xrlab.json` (sala concreta) y `lab/harness/kit.js › ROOM` (réplica de desarrollo). **Nada de una sala
concreta va en el código de una experiencia**: léelo siempre de `vt.walls`.

| | |
|---|---|
| Muros | 4, cierran el círculo (`vt.closedLoop = true`): **P4 · P1 · P2 · P3** de izquierda a derecha en la tira |
| Tira (lienzo de salida) | **7196 × 912 px**; P4 x=0 (1912 px), P1 x=1912 (1692), P2 x=3604 (1920), P3 x=5524 (1672) |
| Anchura de muro | P4 7,33 m · P1 6,483 m · P2 7,353 m · P3 6,411 m (6,4–7,4 m); perímetro ≈ 27,6 m; ≈ 261 px por metro |
| Altura de imagen | **3,75 m** proyectada (el perfil aún dice 3,5; se está confirmando — usa `w.height` de `vt.walls`, **nunca una constante**) |
| Costura | **P3 → P4 es continua**: lo que sale por la derecha de P3 entra por la izquierda de P4 |
| Plano de escaneo | a ~2 cm del muro (P4, P1, P2) y **~12 cm en P3** (reacciona ~10 cm antes del toque) |
| Máscaras | puertas / lámparas donde el sensor no ve (`w.masks`, en px de render): no coloques objetivos ahí |
| Audio | diseña para **4.1: un canal por muro + sub**. El mapa real hoy está en `profiles/xrlab.json › audio` (el Q-SYS comparte canales y no hay sub): el estudio lo adapta; no lo asumas |

### Escala humana (regla del director — obligatoria)

- **Alcance cómodo 0,8–2,0 m** del suelo; **niños 0,6–1,4 m**. Un mapeo vertical **termina en 3,0 m** como máximo: más arriba nadie llega.
  La mitad de un muro de 3,5–3,75 m (~1,8 m) ya es alto: coloca lo importante entre 0,9 y 1,7 m.
- **Un punto cubre ~1,6 m de muro** (lo que abarca una persona sin andar). **Un muro se camina en ~5 s; la sala entera en ~20 s.**
- **Manos ≤ 0,5–1 m/s.** Nadie arrastra la mano a 3 m/s. Diseña para movimientos lentos; el sensor (10 Hz + 150 ms de playback) no
  da tirones a esas velocidades, pero sí a velocidades irreales.
- **1–10 visitantes, a menudo 1–2.** Cada experiencia necesita un **camino en solitario** (una persona hace algo bello y completo)
  **y un camino en grupo** (varias personas lo enriquecen); ambos se describen en el `NOTES.md`.
- **Objetivos ≥ 35–40 cm**; temporización **tolerante** (permanencias de ~0,5 s, sin dobles toques rápidos, sin precisión de píxel).
  Retroalimentación inmediata (<100 ms) al aterrizar una mano, aunque el efecto completo sea lento.
- El 0,8–2,0 m y el «3,0 m» se ven en el arnés con la tecla **B** (escala corporal: adulto 1,70 m, niño 1,20 m, bandas de alcance).

## 4. La API `vt` (de `experiences/runtime.js`)

```js
import { connectExperience } from '/experiences/runtime.js';     // ruta ABSOLUTA, siempre esa
const vt = await connectExperience();                              // visual
```

### 4.1 Forma de `vt`

| Campo | Qué es |
|---|---|
| `vt.canvas` | `{ width, height }` lienzo de la sala (7196×912). |
| `vt.scale` | escala de render (0,25 / 0,5 / 0,75 / 1; la fija el operador en la salida). |
| `vt.size` | `{ width, height }` = **tamaño del `<canvas>` que debes crear** (`canvas.width = vt.size.width`…). Fijo durante la vida de la página (si cambia, la app recarga). |
| `vt.walls` | `[{ id, name, rect: {x,y,w,h} (px de render), width, height (m), pxPerM, masks: [{id,name,x,y,w,h}] }]` en orden de perfil. |
| `vt.closedLoop` | `true` si los muros cierran la sala (costura continua P3→P4). |
| `vt.params` | objeto vivo con los valores de los parámetros del manifiesto. |
| `vt.fps` | 30 ó 60 (el bucle ya lo respeta). `vt.fit` `'fit'`/`'stretch'`. |
| `vt.sink` | destino: `'spout'`, `'window'`, `'browser'`, `'viewer'` (segunda instancia pequeña de la app) o `'layer'` (capa del *output*). |
| `vt.standalone` | `true` si no hay motor (página abierta suelta). `vt.id`: id de la pieza. |
| `vt.on(type, fn)` | `'params'` (objeto `vt.params`), `'touch'` (evento de mano), `'resize'` (sólo standalone). Devuelve la función para desuscribir. |
| `vt.hands()` | las manos **ahora**, como trazos: `[{ id, stroke, trackerId, wallId, x, y, vx, vy, size, ended }]`. |
| `vt.touches()` | versión corta: `[{ id, stroke, wallId, x, y, size }]`. |
| `vt.toPx(wallId, xm, ym)` | metros sobre un muro (`xm` desde su izquierda, `ym` **desde el suelo**) → `[x, y]` px de render. |
| `vt.loop(fn, src)` | bucle: llama `fn(dt)` cada frame (`dt` en segundos, ≤ 0,1) y después `vt.frame(src)`. `src` = contexto WebGL **o el elemento canvas** (WebGPU, 2D). |
| `vt.frame(src)` | lleva el frame a Spout / pantalla / previsualización. Lo hace `vt.loop`; sólo si llevas tu propio bucle, llámalo **en la misma tarea que el dibujo** (sin `await` entre medias). |
| `vt.media` | clips del preset (§4.6). |

**Las manos.** `x, y` en **px de render**, `y` desde **arriba** (convención de pantalla). `size`: tamaño aparente en px de render (divide por
`wall.pxPerM` para metros). `vx, vy` px/s. `wallId`: el muro bajo la mano. Evento `'touch'`: `{ type: 'down' | 'move' | 'up', id, stroke,
trackerId, wallId, x, y, vx, vy, size }`.

- **Trabaja siempre por `stroke`, nunca por `trackerId`**: el sensor puede partir una mano en varios ids; el runtime los cose (mismo
  trazo si reaparece a <0,3 m y <300 ms, también a través de la costura). Un `up` llega ~0,3 s tarde (la ventana de costura).
- Las manos se reproducen **150 ms tarde** sobre una curva por las lecturas reales: no extrapoles ni suavices de más.
- **Costura 360°:** `x` vuelve a 0 al pasar P3→P4. Las diferencias entre dos `x` deben ser circulares:
  `const d = ((dx + W / 2) % W + W) % W - W / 2` con `W = vt.size.width`. Las texturas que se repiten en x usan `REPEAT`; las distancias
  se miden "por el camino corto" alrededor del círculo; el ruido se muestrea sobre un cilindro (ver `_template`).
- **Metros, no píxeles:** radios, velocidades y distancias en metros (`size / wall.pxPerM`, `vt.toPx`). Los muros no son idénticos
  (±1 % px/m, alturas distintas el día que cambie el perfil).

### 4.2 Esqueleto mínimo

```js
import { connectExperience } from '/experiences/runtime.js';
const vt = await connectExperience();
const canvas = document.getElementById('c');
canvas.width = vt.size.width; canvas.height = vt.size.height;
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });

const P = { ...vt.params };
vt.on('params', (p) => Object.assign(P, p));                      // el operador mueve parámetros en vivo

vt.on('touch', (e) => { if (e.type === 'down') console.log('hand lands on', e.wallId, e.stroke); });

vt.loop((dt) => {
  for (const h of vt.hands()) {
    const wall = vt.walls.find((w) => w.id === h.wallId);
    const xm = (h.x - wall.rect.x) / wall.pxPerM;                 // metros desde la izquierda del muro
    const ym = (wall.rect.y + wall.rect.h - h.y) / wall.pxPerM;   // metros desde el suelo
    // ... dibujar con gl
  }
}, gl);
```

`index.html` mínimo (ver `_template/`): un `<canvas>` y `<script type="module" src="./experience.js">`. Para dibujar con 2D o WebGPU pasa
**el elemento canvas** como `src` (`vt.loop(fn, canvas)`); en la sala eso cae en un camino de Spout por CPU si la GPU compartida falla
(≈ 20 fps a 7196×912): **WebGL2 es el camino de producción**.

### 4.3 Estándar y en la app: qué cambia

- En la **app**, la página se abre en `/experiences/<id>/<entry>?run=1` (instancia de la sala), `?run=1&view=1` (visor: segunda
  instancia a ≤ 0,5× y 30 fps, sin Spout) o `?run=1&layer=1` (capa del *output*). Tu página no debe saber cuál es: usa `vt`.
- **Sin motor** (archivo suelto): `connectExperience()` cae a modo *standalone* (un muro "W1" de 500 px/m del tamaño de la ventana,
  el puntero como mano, parámetros por defecto del manifiesto). En el laboratorio el arnés lo sustituye por la sala real (§7).
- **`transparent: true`** en el manifiesto: el canvas va **por encima** de las capas de clips; debe ser alfa **premultiplicado**
  (`premultipliedAlpha: true`) y transparente donde quieras ver el vídeo (la experiencia `reel` es el ejemplo).
- **Calidad:** ofrece un parámetro `quality` (`low/medium/high`) que reduzca resoluciones internas, como `alma-fluid` y `reel`.

### 4.4 Parámetros

Se declaran en el manifiesto (§5); en la página llegan en `vt.params` y cambian en vivo (`vt.on('params')`). El operador los ve en
la pestaña *Experiences* con el tipo de control que corresponde (fader, selector, interruptor, selector de muro). **Todo lo que el
director quiera ajustar en la sala debe ser un parámetro**, con valores por defecto que ya suenen y se vean bien. Nunca construyas
tu propia interfaz dentro de la experiencia.

### 4.5 Experiencias de sonido (`kind: "sound"`; contrato `experiences/SOUND-API.md`)

```js
// sound.js
export default async function start(host) {
  const { audio, vt, params } = host;
  // audio.ctx          AudioContext (48 kHz)
  // audio.walls        [{ id, name, speakers }]
  // audio.wallInput(wallId, u = 0.5) → { node, setPosition(u), disconnect() }   fuente MONO de ESE muro (u: 0 izquierda … 1 derecha vista desde dentro)
  // audio.roomInput()  → AudioNode: suena igual en TODOS los muros (pad)
  // audio.subInput()   → AudioNode: sólo para el sub (graves)
  return { setParams(p) {}, async stop(fadeMs) {} };
}
```

- **Manos en modo sonido**: `vt.hands()` y el evento `'touch'` dan `{ stroke, wallId, u, v, size }`: `u` 0..1 a lo largo del muro, **`v` 0..1
  desde el suelo** (multiplícalo por `vt.walls[i].height` para tener **metros**), `size` en metros. `down` llega **al instante** (sin
  playback); `up` ~0,3 s tarde. `vt.walls` = `[{ id, name, width, height }]`.
- **Nunca** conectes a `ctx.destination`: el host es dueño del volumen general, el silenciado, el limitador final, el cruce del sub
  y los fundidos. Una pieza muy fuerte se limita, y se nota.
- **Altura en metros** (alcance real ~2 m), no como porcentaje del muro. **Sin samples**: osciladores, ruido filtrado, FM,
  convoluciones generadas (ver `_template-sound`).
- **Margen:** una nota ≈ −20 dBFS de pico; todo cambio de ganancia con rampa (`setTargetAtTime`, `linearRampToValueAtTime`): sin clics.
  Limita el número de voces (la más antigua cede con un fundido rápido). Un `down` repetido de un mismo `stroke` no añade voz.
- **Continuidad 360° en el sonido:** una mano que cruza P3→P4 es **un solo trazo**; cualquier mapeo basado en la posición en el
  perímetro debe ser **periódico** (por muro, o con funciones circulares), sin salto en la costura.
- **Localización:** un seno continuo no se sitúa en una sala; un ataque corto, sí. Prefiere ataques con carácter y colas largas.
- Se tocan 1–10 visitantes: piensa en el grupo (¿12 voces a la vez siguen sonando bien?).

### 4.6 `vt.media` — clips del preset

El manifiesto declara huecos: `"media": [{ "key": "reel", "type": "clip" }, { "key": "projects", "type": "clips", "max": 12 }]`.

```
vt.media.available                 true sólo en la instancia en marcha de la sala
vt.media.slot(key)                 'clip' → clip | null · 'clips' → [clip, …]     clip = { id, name, duration (s), hasAudio, thumb, missing }
vt.media.slots()                   { key → … }
await vt.media.play(clip|id, { end = 'clear', transitionMs, loops })   → { playId, startAt }     end: loop|hold|clear|bounce|next|prev|random|first
await vt.media.stop({ transitionMs })
await vt.media.preload(clip|id)    (como mucho 8 a la vez)
vt.media.on('started' | 'ended' | 'error' | 'slots', fn)    { playId, clipId, reason?, error? }
vt.media.state()                   { playing, held, playId, clipId, position, duration }
```

Fuera de la sala (visor, arnés) hay una **simulación** con clips de relleno de 5 s: mismas llamadas, mismos eventos, nada llega a la sala.
**Un `play` puede rechazarse** (archivo ausente, copia en curso): captura el error y muéstralo con elegancia. El laboratorio **no incluye
vídeo**; si necesitas probar con un clip real, es el estudio quien lo asigna en *Live*.

## 5. El manifiesto (`manifest.json`)

Lo normaliza `engine/experiences.js`; lo desconocido se ignora (por eso el arnés admite `"lab": { "help": [["key", "text"]] }`,
que la app no lee). Reglas reales:

```json
{
  "id": "my-piece",                      // ^[A-Za-z0-9_-]{1,40}$ (si falta, el nombre de la carpeta); único en el catálogo de la sala
  "name": "My piece",                    // ≤ 80, inglés
  "description": "…",                    // ≤ 400, inglés
  "kind": "visual",                      // "visual" (por defecto) | "sound"
  "entry": "index.html",                 // visual: index.html · sound: sound.js; sin "/" inicial ni ".."
  "transparent": false,                  // true: canvas premultiplicado POR ENCIMA de las capas de clips
  "media": [ { "key": "reel", "label": "Reel clip", "type": "clip" } ],           // ≤ 16 huecos; type "clip" | "clips" (max 1–64, por defecto 12)
  "params": [                            // ≤ 64; key ^[A-Za-z0-9_.-]{1,40}$; label ≤ 60
    { "key": "fade", "label": "Fade", "type": "number", "min": 1, "max": 20, "step": 0.5, "default": 7, "unit": "s" },
    { "key": "scale", "label": "Scale", "type": "select", "default": "minor", "options": [["minor", "Minor"], ["major", "Major"]] },
    { "key": "logo", "label": "Logo", "type": "bool", "default": true },
    { "key": "brandWall", "label": "Brand wall", "type": "wall", "default": null }   // un id de muro de la sala o null
  ]
}
```

- Tipos de parámetro: `number` (min, max, step, default, unit ≤ 12 car.), `select` (options `[[valor, etiqueta]]`, ≤ 64), `bool`, `wall`.
- La carpeta es hija directa de `experiences/` en la app (en el laboratorio, de `lab/experiments/`): una carpeta por pieza.
- **Visual y sonido son entradas separadas del catálogo.** Una obra audiovisual son **dos carpetas** (`foo` y `foo-sound`); el estudio las
  empareja en un preset. En el arnés, `?sound=foo-sound` en la página visual las reproduce juntas.
- Pon valores por defecto **que ya estén bien**: es lo que verá el director al cargarla.

## 6. Diseño y listón de calidad

**Estética de la casa:** musical, ambiental, meditativa, **muy elegante**. Movimiento lento, respiración, contención. Nada de destellos
bruscos, nada de "efectos". Mucha oscuridad con poca luz bien colocada; la imagen es enorme y rodea al visitante, así que lo
pequeño y lento funciona mejor que lo grande y rápido. **Sin texto** salvo lo imprescindible (y en inglés).

**Las propuestas de `docs/proposals/` son la referencia** de calidad e interacción (se abren con doble clic; mira sus `NOTES`/capturas):
`water-ripples` (aprobada: ondas + notas, 3 "looks"), `threads` (hilos entre manos, intonación justa), `breathe` (piedras que se despiertan
con la mano y florecen al unísono), `aurora` (acordes en piedras, cielo con campanas). Lee su código antes de empezar algo parecido.

- **Los tokens de VEATION** (`#111 / #1B1B1B / #262626`, tinta `#E0E0E0 / #B8B8B8`, cian `#4FC3E8` = vivo, ámbar `#E5B567` = atención,
  Geist) son la línea **del software y de las herramientas del laboratorio** (HUD, ayuda, paneles). **La obra en sí tiene libertad de
  paleta**, pero sigue siendo sobria: pocos colores, fondos profundos, brillos controlados.
- **Nada de deslizadores nativos con tirador/puntito** (`input[type=range]`) en ninguna herramienta ni panel: usa el fader de VEATION
  (surco de 3 px con relleno, sin tirador, valor en recuadro). El kit (`LabKit.createStage().params(...)`) ya lo hace así.
- **Sin costura:** una mano o un efecto que cruza P3→P4 no puede ver ningún corte (ni visual ni sonoro).
- **Sin sorpresas:** el visitante no necesita instrucciones. Algo ocurre en cuanto llega una mano y es hermoso con una sola mano.
  Sin tocar nada, la obra **ya está viva** (ambiente), pero tranquila.
- **Robustez:** que el sensor pierda una mano, que lleguen 10 manos, que no llegue ninguna, que la página recargue: todo se ve bien.
  Pruébalo con la tecla **L** (sensación LiDAR) y **G** (grupo) del arnés.
- **Accesibilidad física:** todo debe poder activarse en el rango de niños (0,6–1,4 m).
- **Cierra el círculo del experimento:** inicio (ambiente), interacción (solo / grupo), reposo (vuelve a la calma sin saltos).

### Presupuesto de rendimiento

- Objetivo: **60 fps a 7196 × 912** en un portátil **RTX 4060**, **con la GPU compartida**: el *output* mezcla clips HAP, la app muestra tu
  página una segunda vez en el visor (≤ 0,5× y 30 fps), y la ventana de audio y la UI también cuestan. Apunta a **≤ 6 ms de GPU por frame** a
  escala 1 (alma-fluid mide 60 fps a 7196×912 con Spout por GPU: es el listón).
- **WebGL2** por defecto. Texturas intermedias (estelas, simulación, ruido) a **fracción del tamaño** de render; sólo el último paso a tamaño
  completo. Parámetro `quality` obligatorio si hay simulación.
- **Sin `readPixels`** ni lecturas síncronas; sin asignar memoria por frame (reutiliza `Float32Array`); sin trabajo por mano que escale
  como manos × píxeles sin tope (límite de 16 manos como en `_template`).
- No cargues recursos pesados al arrancar bloqueando el hilo; precompila los shaders una vez.
- **Mide en el arnés** con `?scale=1` (la HUD muestra los fps; el arnés usa por defecto `scale=0.5` para ir ligero: **no te fíes de esos
  fps para la sala**). Cualquier cosa que no mantenga 60 fps a `?scale=1` en el portátil de desarrollo hay que reducirla o parametrizarla.

## 7. Dos flujos de trabajo

### (a) Prototipo rápido en el navegador (una tarde)

Un único `index.html` que se abre con **doble clic**, con las convenciones de `docs/proposals/`. Parte de `lab/experiments/_template-prototype/`.

- Carga el kit con `<script src="../../harness/kit.js">` (script clásico: funciona por `file://` dentro del repo) y usa
  `LabKit.createStage(...)`: **ratón = toque**, **Shift+clic fija una mano** (otro Shift+clic en ella la quita), manos virtuales **a velocidad
  humana** cuando nadie toca (4 s), HUD, ayuda **H**, **F** tira de sala/ventana completa, **B** escala corporal, **S** sonido, **D** demo,
  **G** grupo virtual (1·2·4·8), **R** quita las fijas, **L** sensación LiDAR, **P** panel de parámetros, **C** cursor.
  Teclas reservadas por el kit: `F B H D G R L S P C`. Libres para la pieza: `1–9 M T V K N X Z E Q W A Y I O U J`.
- Sonido: `LabKit.createRoomAudio()` simula **4.1** (4 canales de muro + sub, con medidores abajo a la derecha) con la forma de
  `audio` del SOUND-API. Es una vista previa estéreo (P4 a la izquierda … P3 a la derecha): dice **qué muro suena**, no cómo suena en
  los altavoces reales. Crea el audio dentro de `stage.onGesture(...)` (el navegador exige un clic).
- Parámetros de URL: `?capture` (sin HUD, para capturas) `?seed=N` `?strip` `?body` `?group=N` `?demo=0` `?lidar` `?wallH=3.5`.
- Un prototipo **no** tiene `manifest.json` (aún): su estado vive en `NOTES.md`. Cuando se aprueba, se **promueve** a (b).

### (b) Experimento listo para el runtime (corre en la app real)

Parte de `lab/experiments/_template/` (visual) o `_template-sound/` (sonido). Estructura:

```
lab/experiments/<id>/
  manifest.json      formato de la app (§5)
  index.html         visual: <canvas> + <script type="module" src="./experience.js">   (sound: no hay index.html)
  experience.js      importa '/experiences/runtime.js' (visual)     ·    sound.js (sonido)
  prototype.html     (opcional) el prototipo de origen, si lo hubo
  NOTES.md           concepto, camino solo/grupo, controles, audio, estado, peticiones (§11)
  preview.png        captura 1600 px de ancho, ≤ 2 MB
  LICENSE-*.txt      si trae código de terceros
```

Reglas: imports **relativos** para tus propios módulos, **absoluto** sólo `/experiences/runtime.js`; nada de red; nada que dependa del
arnés (`window.LabKit`, `window.__labRoom` no existen en la app); sin variables globales de la pieza con nombres genéricos; `id` único
y estable (el nombre de la carpeta = el `id`, salvo plantillas).

Para ejecutarlo en el arnés: `http://localhost:8780/experiences/<id>/index.html` (§8). Para verlo con el runtime **real**, el motor real y el perfil
simulado: §8.2.

## 8. Cómo probar sin hardware

### 8.1 El servidor del laboratorio (no toca nada, no necesita Electron)

```
node lab/harness/serve.mjs                    →  http://localhost:8780/        (índice de experimentos)
```

- `/experiences/<id>/index.html` — un experimento listo para el runtime, **sin cambios**, sobre un runtime de desarrollo
  (`harness/runtime.js`) con la forma de `vt` de la app: tira 7196×912 (por defecto a **escala 0,5**; `?scale=1` a tamaño completo),
  4 muros en metros, `closedLoop`, manos del ratón, manos fijas, manos virtuales, sensación LiDAR (**L**: lecturas a 10 Hz, ~6 % perdidas,
  id nuevo tras el corte, playback 150 ms — con el **`makeHands` real** de la app, leído sin modificarlo), panel de parámetros (**P**),
  `vt.media` simulado, 4.1 simulado (**S**).
- `/sound/<id>` — una pieza de sonido sobre la sala 4.1 simulada (tira dibujada, medidores).
- `/experiments/<id>/…` — los prototipos y los archivos de una carpeta tal cual.
- `?sound=<id-de-sonido>` en la página visual: se oyen juntas.
- **Diferencias con la app (no cuentes con ellas):** no hay Spout, ni motor, ni máscaras de muro; las alturas son 3,75 m; el reparto
  de audio es una vista previa.

**Comprobación automática** (ventana oculta de Electron, sin diálogos, ≤ 15 s; necesita `npm install` hecho una vez en la raíz):

```
node lab/tools/check.mjs /experiences/<id>/index.html --delay 8000 --shot lab/experiments/<id>/preview.png --size 1600x400
node lab/tools/check.mjs "/experiences/<id>/index.html?capture&group=4&seed=3" --eval "return window.__vtDev.hands().length"
```

Imprime una línea `SMOKE {...}` con los errores de consola; **código de salida 0 = sin errores**. Corre siempre esto antes de dar un
experimento por listo, y mira la captura (la tienes que **mirar**: que no haya errores no significa que esté bien). `check.mjs` levanta
su propio servidor y sólo detiene lo que arranca; no mates procesos que no hayas lanzado tú.

### 8.2 El motor REAL con tus experimentos, sin modificar el software

Hoy el motor **sólo escanea `experiences/`** (más una opción interna de pruebas, `experienceDirs`, que no tiene bandera de línea de
comandos), y `npm start` (la app de escritorio) arranca su propio motor sin esa opción. Por eso:

- **`npm start` NO puede cargar experimentos del laboratorio** sin modificar la app o copiar la carpeta a `experiences/` (cosa que **tú no haces**).
- **Sí puedes** usar el motor real con tu catálogo mediante un lanzador del laboratorio que **no modifica nada**: reutiliza `Engine` y
  `createServer` tal cual y le pasa `experienceDirs: [lab/experiments]`:

```
node lab/tools/lab-engine.mjs [--port 8771] [--play <id>]      (datos propios en lab/.data, perfil «Barcelona XR Lab (simulated)»)
```

  Abre `http://localhost:8771/` en Chrome/Edge (**pestaña Experiences → tu experimento → Play**; manos virtuales en la vista Live, también en
  la vista 3D de la sala), o `http://localhost:8771/experiences/<id>/index.html?run=1` para la página con el runtime **real**, los muros del
  perfil y las manos virtuales del perfil simulado. Es lo más cercano a la app que se puede hacer desde el laboratorio.
  Limitaciones: sin Electron no hay Spout ni ventana de audio; el sonido se prueba en el arnés (`/sound/<id>`). Para ver las alturas del
  perfil (3,5 m hoy) y comprobar que tu pieza se adapta a `w.height`, éste es el sitio.
- **Integración en la app y en el perfil de la sala: la hace el estudio**, copiando la carpeta a `experiences/` (y revisando manifiesto,
  rendimiento y licencias). No lo intentes tú.
- Si Vicente quiere un día cargar sus experimentos directamente en `npm start`, hace falta un cambio en el software (p. ej. una variable
  de entorno que añada carpetas de experiencias). **Anótalo como petición** al estudio en `lab/CATALOG.md › Peticiones generales`; no lo implementes.

### 8.3 Perfil simulado y manos virtuales

El perfil **«Barcelona XR Lab (simulated)»** (`profiles/xrlab-sim.json`, se elige solo en un `lab/.data` nuevo) tiene la geometría real con
sensores simulados y manos virtuales en la vista Live. En el arnés, las manos virtuales son **D / G**; **Shift+clic** fija las que quieras.

## 9. Qué NO puede hacer una experiencia (saber el límite)

Una experiencia **recibe manos y dibuja/suena**; no escribe OSC ni TUIO (eso lo hace el motor para otras apps: `docs/OSC.md`), no controla la
calibración, las zonas, la rejilla ni el *Advanced Output*, no accede a disco ni red, y no ve más que `vt`. Los toques por OSC/TUIO/WebSocket
son para proyectos de TouchDesigner/Unreal: **no es tu terreno**; si una idea necesita zonas o disparadores del motor, es una petición.

## 10. Catálogo

```
lab/experiments/<id>/        una carpeta por experimento (nombres en minúsculas con guiones)
lab/experiments/_template*/  plantillas (empiezan por «_»: no se tocan, se copian)
lab/CATALOG.md               el índice: una fila por experimento (id, nombre, tipo, estado, autor, carpeta, notas)
```

Estados (campo **Status** del `NOTES.md` y columna de `CATALOG.md`): `idea` → `prototype` → `runtime-ready` → `under review` → `approved` →
`tested in app` → `integrated`; además `parked`, `rejected` y `template` (sólo las plantillas). El **director** decide `approved`/`rejected`; **el estudio** pone
`tested in app` e `integrated`. Tú pones `idea`, `prototype`, `runtime-ready` y `under review` (cuando Vicente lo da por presentable).

**Actualiza `lab/CATALOG.md` cada vez que cambie el estado de un experimento.** El índice `/` del servidor del laboratorio lee el `NOTES.md`.

## 11. `NOTES.md` de cada experimento

Plantilla en `lab/experiments/_template/NOTES.md`. Cabecera obligatoria (el índice la lee):

```
# <Nombre>

- **Status:** prototype
- **Kind:** visual | sound | visual+sound
- **Author:** Vicente
- **Updated:** AAAA-MM-DD
```

Secciones: **Concept** (qué es, qué se siente), **Solo path** (qué ocurre con una persona), **Group path** (con varias), **Controls** (manos,
parámetros), **Audio** (qué suena y cómo se reparte: wall/room/sub), **Status and tests** (qué se ha probado: arnés, motor real, fps a
`?scale=1`, costura, L/G; qué falta), **Requests to the studio** (lo que falta en el runtime u otras decisiones; "None" si no hay).
Escríbelo **en inglés**: el estudio lo lee para integrar.

## 12. Git

- Trabaja en **tu rama propia `lab/<nombre>`** (p. ej. `lab/vicente`): `git switch -c lab/vicente` (o `git switch lab/vicente`). Nunca en `main` ni en `media-v2`.
- **Commitea sólo `lab/`**: antes de cada commit, `git status` y comprueba `git diff --cached --name-only | grep -v '^lab/'` → debe salir **vacío**.
  Usa `git add lab/` (no `git add -A`). Si hay cambios fuera de `lab/` que tú no hiciste, **no los toques ni los commitees**.
- Mensajes cortos y claros en inglés: `Lab: <experimento> — <qué cambia>`. Sin `--force`, sin reescribir historia compartida, sin `--no-verify`.
- **Abre un PR** hacia `main` (o hacia la rama que indique el estudio) cuando haya algo presentable; el director lo revisa.
- **Nunca** commitees secretos (`.env`, claves, tokens), ni `lab/.data/`, ni medios de **> 20 MB** (vídeo, audio, modelos): se suben al
  Drive del estudio y se enlazan en el `NOTES.md`. `preview.png` ≤ 2 MB y ≤ 1600 px de ancho.

## 13. Lista de comprobación antes de dar algo por listo

1. `node lab/tools/check.mjs …` sin errores y **miras la captura**. 2. Una mano, y 4 manos (**G**), y 0 manos: bien. 3. **L** (LiDAR) no rompe
nada. 4. Cruza la costura P3→P4 (la demo lo hace a veces; también fija una mano en P3 junto al borde): sin corte. 5. **B**: lo importante entre
0,9 y 1,7 m, objetivos ≥ 40 cm, nada pasa de 3,0 m. 6. Camino solo y camino grupo descritos. 7. `?scale=1`: 60 fps. 8. Sólo inglés dentro de
la obra; sólo síntesis propia; sin dependencias nuevas o con licencia MIT/BSD/Apache/ISC anotada. 9. `NOTES.md` y `CATALOG.md` al día.
10. Commit sólo de `lab/`.
