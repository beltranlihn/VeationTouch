# Cuaderno de QA

## Dónde quedé
04:55 — humo final y repeticiones a ritmo 1 hechos, todo PASA; QA parado hasta la congelación (06:15).
04:40 — ventana de GPU 04:30–04:39 hecha y devuelta; cola visual vacía; queda el humo final de las 06:00 (`review_smoke.js`).
00:18 — parado por límite de uso. Cola pendiente: ver «Cola pendiente al cerrar» más abajo.
22:43 — turnos GPU-MEDICIÓN 22:22–22:33 y 22:40–22:43 devueltos. Instrumento de fps con control positivo listo y validado; línea de
base tomada; fps de T-004 festa3d y T-001 brasa3d medidos. Siguiente: veredictos T-004 (antes de 23:05) y T-001 (antes de 23:10).

Herramientas (scratch, fuera del repo): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/`
`bench.js` + `bench.sh` (medida), `capture.py` (capturas), `bench.log` (todas las corridas, también las contaminadas).

## 1. Instrumento de fps (coste real de frame)

**Problema**: los contadores del laboratorio (`__study3d.fps()`, HUD) van por rAF y están topados a 60: "60" = "≥ 60". Además la
ventana oculta de `check.mjs` es *offscreen*: su rAF no es la pantalla.

**Método** (`bench.js`, se pasa como `--eval-file`): dentro de la página, tras `--delay`,
1. captura el `input` de cada parte mientras la página sigue viva; luego **silencia** el bucle de la página (`room.render` y
   `part.update` → no-op);
2. reproduce N = 40 frames seguidos: `part.update(1/60)` de cada parte (incluye la simulación/compute que la parte lance) +
   `room.render` original (4 vistas + post), y tras cada frame **sincroniza con la GPU**: WebGPU `device.queue.onSubmittedWorkDone()`;
   WebGL2 `readPixels` síncrono de 1 px del canvas (guardando y restaurando los framebuffers de three);
3. devuelve mediana / p10 / p90 en ms, el suelo de la sincronización (sin trabajo, ~0,1 ms), y `fpsEq = 1000 / mediana`.
Coste medido = CPU (update + encode) + GPU hasta terminar. No incluye la presentación al compositor ni la HUD.
Uso: `bench.sh <etiqueta> "<página>" '<params JSON>' <delay ms> ['&qaK=2&qaHands=15&qaN=40']` → una línea en `bench.log`.
Siempre `capture&scale=1&demo=0&seed=7`, 7196×912. `qaHands=n`: n manos fijadas en el arnés a 1,4 m, repartidas por la tira.

**Controles (los tres pasan):**
- **Positivo (orden)**: `_example` (parte vacía) 1,3–1,6 ms vs `res-intro3d` high t 38 33,1–33,2 ms → ×20. El instrumento se mueve.
- **Calibración**: intro high t 38 = 33,1 ms → **30,2 fps-eq**, y el contador rAF de la página leía 31; lo conocido en este Mac era
  ~28 fps. Medium 19,7 ms = 50,8 fps-eq (el tablero decía 51 fps en media): coincide.
- **Dosis-respuesta (linealidad)**: con K = 2 renders por frame sincronizado el tiempo se dobla: intro high 33,1 → 64,1 ms (32,0 por
  render); festa 8,9 → 17,0 ms; WebGL2 intro medium 23,2 → 43,4 ms. Medimos trabajo, no una latencia fija.

**Trampas encontradas (por eso los controles):**
- **Contaminación**: otros agentes con `check.mjs` abierto comparten la GPU. Con ventanas ajenas: intro high 118–125 ms, medium 53–65 ms
  (×2–×4 falso). `bench.sh` vigila cada 0,25 s y escribe `others=<n>` (ventanas ajenas); **sólo valen las corridas `others=0`**. Pedir
  ventana quieta al director para medir (hoy congeló a todos 22:30–22:50).
- **WebGL2 con lectura asíncrona** (`readRenderTargetPixelsAsync`) sale cuantizado a 16,7 ms (su valla se sondea por frame): da 16,7 /
  33,4 ms falsos. Sustituido por `readPixels` síncrono; con él la dosis-respuesta es lineal.
- **No medir sólo `render`**: festa3d lanza su simulación en `update()`; sin incluirla, WebGL2 daba 7,5 ms en vez de 15,4. Ahora
  `update` va dentro del frame medido.

## 2. Línea de base (M1 Max, Electron offscreen, escala 1, 7196×912, WebGPU salvo indicación; `others=0`)
| Página | Corrida 1 | Corrida 2 | fps-eq |
|---|---|---|---|
| `res-3d-study?part=_example` | 1,6 ms | 1,3 ms | 625–770 |
| `res-intro3d` high, t 38.05 (MSAA 4, escala 1) | 33,2 ms | 33,1 ms | 30,1 |
| `res-intro3d` medium, t 38.1 (renderScale 0,8) | 19,7 ms | 19,7 ms | 50,8 |
| `res-intro3d` low, t 38.1 (renderScale 0,6) | 14,6 ms | 14,6 ms | 68,5 |
| `res-intro3d` medium WebGL2, t 36–38 | 23,2 ms | (K2: 21,7/render) | 43 |
p90 ≤ 0,5 ms sobre la mediana en todas las corridas limpias: la medida es estable.

## 3. fps de piezas entregadas (mismo instrumento, 22:29–22:32, `others=0`)
| Pieza | Estado | WebGPU | WebGL2 |
|---|---|---|---|
| T-004 festa3d | por defecto (festa, auto) | 8,9 / 8,9 ms → **112 fps-eq** | 15,4 ms → 65 |
| | 15 manos | 10,7 ms → 93 | 20,4 ms → **49** |
| | bloomNow + resonance 1 + 15 manos | 11,0 ms → 91 | — |
| | crown 0,6 | 9,5 ms → 105 | — |
| T-001 brasa3d | por defecto (play) | 7,4 / 7,3 ms → **135 fps-eq** | 7,4 ms → 135 |
| | 15 manos | 8,7 ms → 115 | — |
| | wave + awake + 15 manos | 8,8 ms → 114 | — |
| | reward | 7,4 ms → 135 | — |
| T-002 pinya3d (22:40–22:41) | por defecto | 5,6 / 5,6 ms → **179 fps-eq** | 4,5 ms → 222 |
| | fill 1 / fill 1 + closed 1 / arrive 0,5 / leave 0,5 | 5,6 ms (los cuatro) | — |
| | fill 1 + 15 manos | 6,2 ms → 161 | — |
| | K2 (control) | 11,0 ms (5,5 por frame) | — |
| T-003 pom3d (22:41–22:42) | por defecto | 6,2 / 6,3 ms → **160 fps-eq** | 7,0 ms (progress 1) → 143 |
| | progress 0,3 / 0,7 / 1 | 6,7 / 7,1 / 7,3 ms | — |
| | cycle (subida en bucle) / restless | 5,8 / 7,1 ms | — |
| | progress 1 + 15 manos | **12,1 ms → 83** (×1,7: coste por mano notable) | — |
| | K2 (control) | 14,0 ms (7,0 por frame) | — |
Control al abrir la ventana de 22:40: intro high t 38 = 33,5 ms (= línea de base 33,1).
Las cuatro piezas ≥ 50 fps en WebGPU con margen. Aviso: festa3d en WebGL2 con 15 manos queda en 49 (el respaldo, no el camino principal).


### Ventana 22:57–23:05 (T-010 festa3d, T-005 res-obra3d) — control intro high t 38: 33,3 ms (= línea de base)
Las 3 primeras corridas salieron `others=1` (una ventana ajena aún abierta al empezar la congelación: festa 12,3–13,4 ms falsos) y se
repitieron limpias: el vigía funcionó.
| T-010 festa3d | WebGPU | WebGL2 |
|---|---|---|
| por defecto | 8,1 / 8,3 ms → **122 fps-eq** | 9,2 ms → 109 |
| 15 manos | 9,7 ms → 103 | — |
| resonance 1 + 15 manos | 9,8 ms → 102 | **10,6 / 10,6 ms → 94** (criterio ≥ 50: pasa; antes 49) |
| crown 0,6 | 9,6 ms → 104 | — |

**T-005 res-obra3d, la obra entera** (salto a cada bloque con `jump`, 8 s después; mide `update` de las partes activas + render; WebGPU;
sin manos ni guía activa salvo la que pinte el bloque):
| Bloque | high (escala 1, MSAA 4) | medium (0,8) |
|---|---|---|
| wait | 13,0 ms → 77 | 9,3 → 108 |
| intro | 20,1 / 20,4 → **49** | 12,3 → 81 |
| brasa | 13,3 → 75 | 9,5 → 105 |
| pinya | 12,9 → 78 | 10,3 → 97 |
| **tronc** | **30,2 / 30,2 → 33** | 18,0 / 18,0 → 56 |
| pom | 8,4 → 119 | 4,8 → 208 |
| crown | 12,9 → 78 | 8,8 → 114 |
| festa | 10,9 → 92 | 8,0 → 125 |
| **baixada** | **30,4 / 30,3 → 33** | 18,0 / 17,9 → 56 |
| fall | 5,7 → 175 | 3,6 → 278 |
| acta | 5,9 → 170 | 3,6 → 278 |
tronc a `low`: 13,9 ms → 72. En el M1 Max, `medium` mantiene ≥ 50 en todos los bloques (mínimo 56 en tronc/baixada); `high` no
(tronc y baixada 33, intro 49): el castell cerca (6,5 m, densidad 1) con MSAA 4 es lo caro. En la sala (RTX 6000 Ada) high está pensado;
aquí no se puede afirmar.

### Costura con el bloom nuevo de room3d (23:04)
Misma escena que el hallazgo (brasa3d, ola cruzando P3|P4, +1,3 s), dos corridas con y sin bloom (`caps/seam2/`): peor salto a través
de la costura **6,8 / 7,6** con bloom (antes 28–44) y 6,4 / 7,4 sin bloom; dentro de un muro 24–36. **Arreglado.**


### Ventana 23:16–23:24 (T-011 castell, pom3d T-008, brasa3d T-009, pinya3d T-007)
Corridas con `others=1` repetidas (hubo 5: alguien abrió `check.mjs` durante la congelación; el vigía lo marcó). Control intro high t 38:
**25,4 ms** (antes 33,1): no es contaminación (`others=0`); `castell.js` cambió con T-011 y la intro lo usa.
| Medida | Corrida 1 | Corrida 2 | fps-eq |
|---|---|---|---|
| obra high **tronc** (T-011) | 26,8 ms | 26,3 ms | **37–38** (antes 33; objetivo 45: no llega) |
| obra high **baixada** | 26,7 | 26,4 | **37–38** (objetivo 45: no llega) |
| obra high intro | 20,5 | 20,1 | 49–50 |
| pom3d progress 1, 0 manos | 10,5 | 10,5 | 95 (antes 7,3 ms: la base subió con torres-cuerpo y balcones) |
| pom3d progress 1, 4 manos | 10,5 | 10,8 | 93–95 |
| pom3d progress 1, **15 manos** | 10,7 | 10,8 | **93** (antes 12,1 ms/83: el coste por mano ha desaparecido, objetivo ≤ 8 ms en total no, pero sí el de las manos) |
| pom3d 15 manos WebGL2 | 9,8 | — | 102 |
| pom3d progress 0,4 | 9,7 | — | 103 |
| brasa3d T-009 progress 0,6 | 11,0 | 10,8 | 91–93 (antes 7,3) |
| brasa3d progress 1 + 15 manos | 12,4 | — | 81; WebGL2 13,7 → 73 |
| brasa3d leave 0,5 | 9,9 | — | 101 |
| pinya3d T-007 fill 1 | 6,1 | 6,2 | 162–164 |
| pinya3d closed + 15 manos | 7,4 | — | 135; WebGL2 9,5 → 105 |
| pinya3d leave 0,5 | 9,3 | — | 108 |
**Tirón de creación de pinya3d**: `create()` medido en la página (import 3 ms, create 4 ms y 2 ms; control: una espera ocupada de 300 ms
se mide 300). No reproduzco el 1,2 s del constructor (quizá lo hace en la importación con caché o en el primer update).
**Tirones en las transiciones de res-obra3d** (`hitch.js`: mayor hueco entre frames rAF en 7 s tras saltar; control: espera ocupada de 300 ms
a los 3 s → se mide 310): brasa→pinya 31 / 31 / 31 ms (una corrida de 4 dio 139); pom→crown 60 / 61; pinya→tronc 54; crown→festa 20;
festa→baixada (acabó en fall) 70; baixada→acta 24; wait→intro 61; intro→brasa 43. Sin tirones serios (≤ 70 ms = 3–4 frames) en las
transiciones reales; tronc→crown (salto que no ocurre en la obra) dio 443.


### Ventana 23:50–23:55 (T-011 paso 5, brasa T-013, pom final, festa, pinya, tirones) — todas `others=0`
Control intro high t 38: 25,6 ms (= 25,4 de la ventana anterior; castell nuevo).
| Medida | Corrida 1 | Corrida 2 | fps-eq |
|---|---|---|---|
| obra high **tronc** (MSAA 2) | 20,1 ms | 20,3 ms | **49–50** (objetivo T-011 ≥ 45 ✓; antes 37–38) |
| obra high **baixada** | 21,6 | 21,6 | **46** ✓ |
| obra high intro | 15,4 | — | 65 |
| brasa3d progress 0,6 | 10,1 | 10,1 | 99 |
| brasa3d progress 1 + 15 manos | 11,3 | 11,2 | 89 |
| pom3d progress 1, 0 / 4 / 15 manos | 10,3 / 10,4 / 10,6 | 15 manos 10,8 | 97 / 96 / 93–94 |
| festa3d | 8,3 | 8,2 | 121 |
| festa3d 15 manos | 10,4 | 10,5 | 95–96; WebGL2 10,8 → 93 |
| pinya3d fill 1 | 6,3 | 6,3 | 159; closed + 15 manos 7,5 → 133 |
**Tirones en frío, calidad high** (`hitch.js`, control 300 ms → 310): wait→intro 50, intro→brasa 39, brasa→pinya 28, pinya→tronc 51,
tronc→pom 59, pom→crown 23, crown→festa 21, festa→baixada (acabó en fall) 70, baixada→acta 28 ms. Confirma lo de INT (20–77 ms).


### Ventana 04:30–04:39 (todas `others=0`) — control intro high t 38: 25,2 ms (= 25,4 / 25,6 de antes)
**La obra entera, por bloque** (ms → fps-eq):
| Bloque | high | medium |
|---|---|---|
| wait | 10,4 → 96 | 9,3 → 108 |
| intro | 15,4 → 65 | 12,2 → 82 |
| brasa | 12,2 → 82 | 10,7 → 93 |
| pinya | 10,7 → 93 | 10,5 → 95 |
| tronc | 20,3 / 20,3 → **49** | 15,6 → 64 |
| pom | 9,8 → 102 | 7,7 → 130 |
| crown | 11,5 → 87 | 10,0 → 100 |
| festa | 8,5 → 118 | 8,0 → 125 |
| baixada | 21,7 / 21,7 → **46** | 16,8 → 60 |
| fall | 7,5 → 133 | 7,4 → 135 |
| acta | 3,5 → 286 | 3,3 → 303 |
medium ≥ 60 en todos los bloques; high ≥ 46 en todos.
**Piezas**: brasa (T-024) 10,1 ms → 99, 15 manos 11,4 → 88 · festa (04:20) 8,5 → 118, 15 manos + res 1 10,3 → 97 · pom (detalle de ciudad)
progress 1 **11,4 ms** (antes 10,3–10,8: +0,6–1,1 ms, objetivo ≤ +2 ✓), progress 0,05 9,9, 15 manos 11,9 → 84, **salida 0,3: 18,1 / 18,1 ms → 55**
(lo más caro de pom: las grietas v3) · pinya 6,2 → 161 · fall3d 8,1 → 124 · tronc3d 1,6 y baixada3d 1,8 ms solos (sin el castell en el estudio;
su coste real va dentro de tronc / baixada de la obra).
**Tirones en frío, high** (`hitch.js`): wait→intro 21, intro→brasa 19, brasa→pinya 29, pinya→tronc 27, tronc→pom 26, pom→crown 26,
crown→festa 20, festa→baixada 27, baixada→acta 20, pom→fall 23 ms. Todos ≤ 29 ms (antes hasta 70): confirma el arreglo de INT.

## 3b. Latencia de la mano (`latency.js`, eval)
Fija una mano y, justo después de cada render de la página, copia un parche de 120×120 px del canvas alrededor de la mano a un 2D
(en la misma tarea que el dibujo: vale en WebGPU y WebGL2) y mide su luma; latencia = del `put` al primer frame con salto > máx(6, 2×ruido).
Parche de control en el muro opuesto. En el arnés las manos son directas (sin los 150 ms de playback de la sala, que son a propósito).
| Pieza | Mano | Luma antes → 1.er frame | Latencia | Control |
|---|---|---|---|---|
| festa3d (auto off) | P2 u 0,5 1,2 m | 4,6 → 156,9 | **28 ms, 1 frame** | sin salto |
| festa3d (auto off) | P3 u 0,97 1,3 m (costura) | 9,7 → 162,5 | **12 ms, 1 frame** | salto a 487 ms (la onda) |
| brasa3d | P2 u 0,5 1,2 m | 5,1 → 223,9 | **15 ms, 1 frame** | sin salto |
| `_example` | — | 0 → 0 | — | la luz no tiene nada que iluminar: no sirve de control positivo |

## 4. Herramienta de capturas (`capture.py`)
`python3 capture.py <out> <etiqueta> <página> '<params>' [--delay 6000] [--pins P3:0.97:1.2,P4:0.03:1.2] [--after 100] [--query '&part=x']`
→ tira 7196×912, un PNG por muro, la costura P3|P4 (300 px a cada lado con una raya magenta de 2 px entre ambos, no es imagen),
las tres esquinas interiores, y `_meta.json` con: errores de consola, **reloj de la página en el momento del disparo** (para comparar
instantes), manos fijadas y las que ve la sala, luma de la banda de la guía (0,9–1,6 m, 40 % central de cada muro: media, p99, máx.)
y salto de luma a través de la costura frente al salto entre dos columnas dentro de P3 y de P4.
Control: intro medium t 46 + 5 s de espera → reloj 50,7 en el disparo; dos manos fijadas aparecen en la sala (muro 3 u 0,97 y muro 0
u 0,03); costura continua a la vista.

## Veredictos

### festa3d tras 04:20 (estela de mano ≤ 1 m/s, destello de corona) — **PASA** con aviso sobre mi instrumento (04:23)
- Floración (serie pk4): 12 → 26 → 39 → **64** → 33 → 17 → 13; subida ≤ ×1,65/s (entre 1,5 y 3,5 s ×2,17 en 2 s = ×1,47/s), 0 % a 255, calma ~7,5 s. ✓
- Parpadeo resonance 1: **sin auto 1,1–1,4 %** en 3 parches ✓; con `auto` (estudio) 1,0–9,8 % según la corrida; con 15 manos recién puestas
  (sin auto) 5,8–6,8 %. **Aviso**: `shimmer.js` no distingue parpadeo de movimiento rápido: anillos recién lanzados que corren a 3,6 m/s
  también cambian > 40 de luma por frame. El 28 % de antes era la placa entera hirviendo; esto son ráfagas que coinciden con impulsos.
  No lo doy por FALLA sin verlo en movimiento: que alguien lo mire a 60 fps en la sala o en el visor (15 manos, resonancia alta).

### pom → fall (intent) oscuro · pom → crown sigue en oro (3D-PO) — **PASA** (03:56)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/fallobra4/board.png` (intent por la regla del score, ritmo 2: t 2,4 / 6,4 / 8,4 · pom→crown +1,5 / +3 s). Sin errores.
- Intent: la enxaneta y las luces de oro se apagan; detrás de «IT FELL» banda **8–22** a t 2,4 (antes 38–54); a t 6,4 sube a 39–55 en P4/P1
  durante la explosión del castell (es fall3d, no pom), y vuelve a 13–25. Ya no hay estrella junto al texto.
- pom→crown: sigue rompiéndose en triángulos con grietas y destellos de oro mientras entra la corona (banda 9–58). Sólo la salida a la caída es oscura. ✓

### fall3d en la obra, con el resultado que pone el score (corrige mi nota de 03:42) — carregat **PASA** · intent **PASA** con nota (03:47)
**Corrección**: en mi serie de 03:42 forcé `jump: fall`, y `score.jump('fall')` pone `outcome = 'intent'` si no hay otro: aquello era intent,
no carregat. Ahora el score decide solo: `jump` a baixada (o a pom) **sin manos** → el score cae por su regla (`emptyFor ≥ B.empty`):
`outcome: 'carregat'` desde baixada (a 6 s, ritmo 1) e `'intent'` desde pom (a 12 s de score; uso ritmo 2, que también acelera la caída ×2).
`capture.py` devuelve ahora `qa` (outcome, bloque, t del score) para dejarlo probado en cada captura.
- **Carregat** (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/fallobra2/carregat.png`, ritmo 2, t 3 / 6,8 / 11): el castell se hunde desde la base en partículas sobre un charco tenue,
  polvo, oscuro; «IT FELL» legible. Banda ≤ 34 (el charco ya no sube la banda: la corrección de 3D-BR se ve). ✓
- **Intent** (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/fallobra3/intent.png`, t 0,6 / 2,4 / 4,4 / 6,4 / 8,4): la ciudad de pom se agrieta en oro y se rompe en triángulos (2,4–4,4),
  el castell del grupo se ensambla tenue entre los fragmentos (4,4) y salta en trozos de oro por toda la sala (6,4); queda la luz de la enxaneta
  y negro. Se lee como caída en el lenguaje de la obra. Sin errores.
  **Nota**: el castell que «se ensambla en el negro» apenas se distingue entre los triángulos (t 4,4), y la estrella de la enxaneta a ~1 m en P4
  sube la banda a 78 durante la explosión. No bloquea.

### pom3d detalle de ciudad (3D-PO) — **PASA** la imagen (03:45); coste en la ventana de 04:30
`caps/pom6/board.png`: fachadas con balcones, ventanas encendidas, arcadas en planta baja (progress 0,05); desde arriba ventanas en los
bloques del Eixample y la cúpula. Sin errores; WebGL2 sin errores. Banda 15–42.

### fall3d dentro de la obra (3D-BR + INT) — **ERRÓNEO, ver la corrección de 03:47: era intent forzado por el salto** (03:42)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/fallobra/board.png` (baixada → fall, +1 / 2,5 / 4,5 / 6,5 / 8,5 / 10 s; capturas en ventanas separadas, así que el instante exacto varía ±1 s).
Sin errores. El castell sigue entero al entrar, se vacía desde arriba en partículas sobre su base, el charco de oro se enciende (+6,5 s) y se
apaga en polvo; «IT FELL / The embers remain» se lee todo el rato; negro a ~10 s. Ningún píxel a 255 (media de la tira ≤ 22).
**Nota**: a +6,5 s el charco de oro cae dentro de la banda de la guía y la sube a 117–139 de media en P4/P1 durante ~1 s; no deslumbra
(sin 255), pero es el instante más claro de la caída justo donde va el texto. **Intent**: con `jump` desde pom la obra hace la misma
caída que desde baixada (los números de las dos series coinciden): el resultado lo decide el estado del score, no el salto. Hay que verlo
en el pase real con `review_smoke.js` (pom fallido) — lo dejo para el humo final.

### INT robustez (LiDAR, arranque, abandono, carga) — **PASA** con una medida que no pude repetir (03:44)
- **Manos duplicadas con LiDAR** (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/dup.js`: 9 manos quietas fijadas en pom, 8 s): directo máx. 9 simultáneas / 9 trazos; `?lidar` máx. **9
  simultáneas** (ninguna mano doble a la vez) pero **54 trazos distintos** en 8 s (cada mano cambia de trazo ~6 veces: es el sensor).
  El «18 → 13 aterrizajes» de INT se cuenta dentro del host, que no expone ese número; no lo he verificado. Lo que sí: nunca hay dos manos
  donde hay una.
- **Arranque**: con `?lidar`, sala vacía, a 2,5 s de cargar ya está la espera con las 4 dianas y el texto (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/start25.png`). ✓
- **Abandono**: desde pinya y desde tronc sin manos a ritmo 8 → `pinya>wait`, `tronc>wait` en < 12 s, sin errores. ✓
- **Carga**: página lista (`__obra`) entre 1 y 3 s (a 1 s aún no; a 2,5 s sí). ✓

### pinya palma 0,28 m (3D-PI) · botones suaves de la guía (INT) — **PASA** (03:38)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/obra7/board.png` (pinya sola: mano +3 s · obra pinya / tronc / baixada→fall con una mano en P4 a 1,25 m). Sin errores.
- Palma: el resplandor queda en la mano (≈ 0,3 m), ya no ilumina el pecho de la figura. Bien.
- Botones: anillo y arco de progreso nítidos, icono y relleno al 30 %: se leen sin tapar la multitud ni el castell. Banda del muro con mano 60–97
  (es la mano y la figura), resto 6–30.

### T-024 rastro (re-check) — **PASA** (03:34) · pom3d salida v3 — **PASA** · tronc3d cinturones bajos — **PASA** (03:34)
- **Rastro** `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/brasa24b/drag.png` (directo | `?lidar`): una cinta de brasas rojas cuelga a la altura de la mano a lo largo del camino. **Corrección
  de mi medida de 03:29**: la caja que usé (y 200–560 = 1,45–2,9 m) quedaba POR ENCIMA de la mano (1,2 m); medido a la altura de la mano
  (y 520–640): ahora 4,5–6,5 % > 60 (directo) y 3,5–9,8 % (LiDAR), sin mano 0 %; la versión anterior daba 0,4–1,3 % y a la vista no se veía,
  así que la FALLA era correcta en la imagen aunque el número estaba mal colocado. Ahora se ve.
- **pom salida v3** `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pom5/board.png`: grietas que nacen en pocos puntos y se extienden, sin red de triángulos; banda máx. 41 → 13 en leave
  0,05–0,8; **WebGL2 idéntica** al decimal. Sin errores.
- **tronc cinturones bajos** `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/tronc2/cmp.png`: los de abajo ahora esmaltados (verdes, azules, ocres) y no blancos; **WebGL2 idéntica**. Sin errores.

### Acta llegada (T-022, 3D-PI) · intro→brasa (INT, arreglo) · pom→crown — **PASA** los tres (03:33)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/obra6/board.png` (fall→acta +0,4 / 1,5 / 3 s · intro→brasa +0,3 / 0,8 s · pom→crown +1,5 / 3 s). 7 capturas sin errores.
- Acta: «2 de 7 · INTENT» se arma de partículas de oro sobre el charco de la caída (+1,5 s ya se adivina; +3 s legible con la glosa). Bien.
- intro→brasa: a +0,3 s el título se ha ido; a +0,8 s sólo «I · BRASA» con las esquirlas cayendo. El texto doble está arreglado.
- pom→crown (mi aviso de T-005): ya no se queda negro; la noche de pom se rompe en triángulos de oro mientras entra la corona. Se cruzan.

### T-024 brasa3d correfoc (3D-BR) — **FALLA** sólo en el rastro (03:29)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/brasa24/touch.png` (toque P2 +0,1 / +0,5 / +1,5 s), `drag.png` (arrastre de 2 m a 1 m/s en P1: directo | `?lidar`). 7 capturas sin errores.
- **Toque**: a +0,1 s un chorro de chispas que sube y cae (ya no la bola blanca), a +0,5 s sale el diablo, a +1,5 s el diablo corre: el guion
  se cumple y es bello. 15 manos: banda 20–55 (≤ 60 ✓, como dice el constructor). Con LiDAR el arrastre da 1 diablo (no 3) ✓.
- **Rastro** (GUION: «al arrastrar, un rastro»): tras arrastrar 2 m la zona del camino (1,2–2,9 m de altura sobre el lecho) tiene luma media
  **4,7 y 0,01 % de píxeles > 60** en directo (control sin mano 1,5 / 0 %); con `?lidar` 15,8 / 2,9 % porque entra el diablo, no el rastro.
  A la vista no hay cinta de brasas colgando donde pasó la mano (`drag.png`, izquierda): un visitante no ve su rastro.
**Arreglo**: que la cinta de brasas se vea 2–3 s a lo largo del camino (brillo de brasa, no de chispa blanca). Re-check: la misma captura
`drag` (`--js` con 41 `put` cada 50 ms de 1,5 a 3,5 m en P1) → en el camino ≥ 1 % de píxeles > 60 y una cinta visible de punta a punta.

### festa3d tras los cambios de 03:26 (3D-FE) — **PASA** se mantiene (03:27)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/festa18d/board.png`. Floración (misma serie): media 12 → 17 → 26 → 38 → **64** (+5,5 s) → 33 → 17 → 13; subida máx. **×1,66/s**, 0 % a 255, calma a
~7,5 s. Relleno en oro (ya no beis), arriba fundido suave sin banda negra. Parpadeo resonance 1: 2,2 %; resonance 0 sin auto: 0 %. Sin errores.

### pom3d llegada por fragmentos + cúpula por celdas (3D-PO, T-022) — **PASA** (03:26)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pom4/board.png` (arrive 0,1 / 0,25 / 0,4 / 0,6 / 0,8, progress 0). 6 capturas sin errores; WebGL2 igual (banda al decimal).
Las torres de trencadís se abren de arriba abajo, las teselas suben y se hacen estrellas con estelas de fibra; la noche se arma en celdas con
junta de oro (0,25–0,8) y la ciudad entra al final. Banda de la guía 12–32 en toda la serie, sin saltos. El coste del primer update lo mido en la
ventana de las 05:00 (`hitch.js` tronc→pom).

### T-021 tronc3d v2 (3D-PO) — **PASA** con nota (03:24)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/tronc/board.png` (floors 1/3/6/9, lean+weak, reward, arrive 0,5, leave 0,5), `zoom.png`, y el compuesto del constructor `compc_small.png`.
9 capturas sin errores; WebGL2 igual; costura 0. Los cinturones de teselas se añaden piso a piso, suben de color (blanco → oro → rojo arriba),
con `weak` las teselas de arriba se sueltan y vuelan (fragmentación), reward las apaga, arrive/leave en nube de teselas. En el compuesto
(castell + mosaico + texto partido «KEEP IT STRAIGHT / HOLD…») se lee como faixes de trencadís sobre los cuerpos.
**Nota (no bloquea)**: los cinturones bajos salen casi blancos y lisos; el «trencadís real con brillo iridiscente» del ARTE sólo se ve en los
pisos altos. Si hay tiempo: más color y más junta oscura abajo.

### T-012 pinya3d brazos + muros llenos (3D-PI) — **PASA** (03:24)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pinya12/zoom.png` (mano +3 s · closed · fill 1 en P4). 4 capturas sin errores; WebGL2 idéntica en la banda.
- Brazos: dos tramos rectos con codo y mano al final, alturas y ángulos variados; ya no hay S continuas: se leen como brazos alzados.
- Muros llenos: unos cuerpos encendidos y otros oscuros alternando, luz fuerte sólo en la mano. Banda fill 1 **18–29** (antes 31–34), closed 54–60.

### T-014b / T-018 festa3d (3D-FE, re-juicio conjunto) — **PASA** (03:22)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/festa18/board.png` (floración +1,5 / 4,5 / 5,5 / 7,5 s · crown 0,35 / 0,6 / 0,85 · resonance 1). Sin errores; WebGL2 sin errores.
- **Floración** (criterio del director, serie `pk4_<ms>`, 4 manos, `bloomNow`): media de la tira 9 → 12 → 17 → 27 → 39 → **53 (pico, +5,5 s)** → 35 → 19 → 13;
  subida máx. **×1,54 por segundo** (≤ ×2 ✓), **0,00 % a 255** ✓, calma a ~7,5–9 s (media 13–19) ✓. La grieta abre y la sala florece sin fogonazo.
- **Parpadeo** (`shimmer.js`, % píxeles que saltan > 40 por frame): resonance 1: 0,9 y 4,3 % (≤ 5 ✓; antes 28 %). Aviso: resonance 0
  **con `auto` (autoimpulsos sólo del estudio)** da 10,7 % en un parche (sin auto 0 %, sin arena 4,2 %): no existe en la obra; si `auto` se
  usa en alguna demo, revisar la arena de los autoimpulsos.
- **Coronación**: coronas a ~0,85 m sobre las celdas, banda de la guía 21–58, claroscuro conservado. Bien.

### T-022 llegadas en res-obra3d (3D-PO, 3D-PI, 3D-BR, INT) — **PASA** las llegadas · **FALLA** un texto doble en intro→brasa (00:18)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/obra5/board.png` (tronc→pom +0,5 / +3 s · fall→acta +0,8 / +2,4 s · intro→brasa +0,4 s · brasa→pinya +1 s). 10 capturas sin errores.
- pom llega en teselas de trencadís que suben sobre los trozos de la plaza; a +3 s la noche agrietada en oro con el título. Bien.
- acta: a +0,8 s ya se ensamblan las partículas sobre la caída; a +2,4 s «2 de 7 · INTENT» se lee. Bien (antes de lo que dice 3D-PI).
- brasa: a +0,4 s las esquirlas rojas ya caen; brasa→pinya +1 s: la brasa se rompe en trozos rojos bajo «II · PINYA». Bien.
- **FALLA (INT)**: intro→brasa a +0,4 s, **«RESSONÀNCIA» y «I · BRASA / Awakening / Put your hands on the wall» están superpuestos** en los
  cuatro muros (mismo sitio, los dos legibles a medias). Arreglo: que el título de la intro se haya ido (o se desplace) antes de que entre
  el cartel de Brasa. Re-check: `x_intro_brasa_400` y `_1200` → un solo texto en cada muro.

### INT, lote de 00:00 (guía, líneas T-022, espera, Tronc, baixada, acta, traspaso carregat) — **PASA** con notas (00:14)
Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/obra3/` (bloques a 9 s, medium, con y sin guía) y `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/obra4/b1.png`, `b2.png` (transiciones a tiempos fijos). Sin errores en ninguna.
- **Contraste de la guía**, medido bien: misma escena con `guide:true` y `guide:false`; píxeles de texto = los que la guía aclara > 60 y
  pasan de 150; contraste = luma del texto / p90 del fondo detrás de esas mismas letras (sin guía). **Control**: mi primer intento
  (p99,5/mediana de una caja) daba 4–119× también en cajas SIN texto (festa, pom, brasa, pinya): no servía, y lo descarté.
  Resultado: wait 8,6–9,8 · pinya 12–15 · tronc 3,5–27 · pom 3,0–4,5 · crown **2,3 (P2)**, 4,7–6,2 · festa 44–55 · baixada 4,9–86 ·
  fall 5,2–26. Todo ≥ 3 salvo crown P2 a 2,3 en ese instante (INT decía 2,9): a la vista «CROWNED» se lee (`obra3/text_check.png`). Aviso, no bloquea.
- **Líneas T-022**: crown→festa, un solo texto a la vez (+1 / 2,5 / 4 s); Tronc: el título solo hasta que toca (+1 / 3 / 5 s), sin la línea
  encima (lo que vi a las 23:58 está arreglado); wait→intro +1 s: el texto de la espera ya se fue; intro→brasa +0,5 s: la plaza ya está
  rota en trozos; festa→baixada: oscuro a +1 s, el castell entra a +2,5 s. Todo como dice INT.
- **Espera oscura**: 91,7 % de la tira bajo 15 de luma (INT 93 %), con la línea de brasa fina; carteles legibles (8,6–9,8×). Bien.
- **Tronc**: plaza en penumbra (60–71 % bajo 15), castell y diana legibles. El texto partido («KEEP IT STRAIGHT» / «HOLD BOTH SIDES»)
  sólo sale con pisos levantados: con un salto sin manos no llego; lo doy por la captura de INT, sin verificar yo.
- **Baixada (compuesto)**: 53 % bajo 15 (INT 61 %, otro instante); el castell suelta teselas al bajar; banda de la guía ≤ 89. Bien.
- **Acta**: 86 % bajo 15, «2 de 7 · DESCARREGAT» claro. Bien.
- **Traspaso carregat** (baixada→fall, `b2.png` filas 5–7): el castell sigue entero y en su sitio al entrar en fall y después cae en
  partículas: sin salto a la vista. (No mido la diferencia de luma en el instante exacto: el salto con `jump` no coincide con el de la obra.)

### T-017 fall3d, la pieza sola (3D-BR) — **PASA** (00:05); el compuesto en res-obra3d, cuando INT lo integre
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/fall/intent_board.png`, `carregat_board.png` (reloj 1,4 / 3,0 / 4,5 / 6,9 / 9,9 / 12,4 s). 13 capturas sin errores; WebGL2 igual (t 5,45, banda
igual al decimal). Intent: el castell entero en pie → se agrieta → cae desde arriba, la pinya queda y se derrumba después, charco de oro en
el suelo, brasas, polvo; negro a 12,4 s. Carregat: se suelta todo a la vez (a 4,5 s ya es una cascada de partículas sobre el charco), polvo,
negro. Los dos se distinguen y los dos se leen como caída en el lenguaje de la obra (partículas que caen, se enfrían y se apagan). La banda
de la guía queda ≤ 66 de media mientras el castell está en pie y cae a ≤ 16 a los 10 s. No compruebo aquí el traspaso (0,91 del
constructor): lo miro en el compuesto.

### T-016 pinya3d (3D-PI) — **PASA** · T-012 — **FALLA** sólo en los brazos alzados (00:02)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pinya16/press_zoom.png` (mano adulta 1,25 m a 3 s · mano de niño 0,8 m a 3 s · WebGL2), `board.png` (arranque a 1,5 / 2,5 / 3,5 s, fill 1, closed).
8 capturas sin errores; WebGL2 igual (banda idéntica). Banda: fill 1 31–34, closed 56–64 (≤ 80), con mano 47–50.
- **T-016**: la figura que viene a apretar es materia oscura y la luz nace en su palma contra la mano del visitante; un charco cálido en el
  suelo bajo ella; manos con dedos. A 0,8 m (niño) la figura baja la palma a esa altura. Bello y claro.
- **T-012, arranque**: a 1,5 s la multitud ya está entera; de 1,5 a 3,5 s sólo baja un poco la luz (banda 40 → 33): ningún «pop» por tipos.
  Bien. Piernas y manos con algo de forma: bien.
- **T-012, brazos alzados**: **siguen leyéndose como tubos ondulados** (antenas / tentáculos) en las filas de atrás (`press_zoom.png`, todo
  el fondo): curva en S sin codo ni hombro marcados, mismo grosor de punta a punta. Qué arreglar: brazo en dos tramos rectos con codo
  (ángulo 20–60°), hombro que sube, antebrazo algo más fino y mano abierta al final; variar altura de los brazos por cuerpo. Re-check:
  `press3s` y `closed` en el mismo recorte; que no quede ninguna S continua en la fila del fondo.

### T-014b festa3d, la ressonància libre (3D-FE) — **FALLA** (el pico inunda la sala a los 2–5 s) (23:59)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/festa14/board.png` (1 mano 6 s · 4 manos +0,9 s del pico · +3 s · 15 manos +1,2 s · +3 s), `solo_zoom.png`, `pk4_*` (serie temporal). Sin errores.
- **Solo**: la roseta de oro fino que se abre bajo una mano quieta es preciosa (`solo_zoom.png`); banda del resto de muros 2–3. Bien.
- **Pico**: la grieta de luz que nace entre las manos y da la vuelta a ~2,15 m cruzando P3→P4 es lo que pedía Vicente (+0,9–1,2 s; costura 5). Bien.
- **Pero** después la placa entera se enciende: serie con 4 manos, segundos tras el pico → **% de la tira con luma > 40 / media de la tira**:
  1,5 s 20 % / 24 · 2 s 37 % / 49 · **2,5 s 86 % / 105 · 3,5 s 84 % / 108 · 5 s 77 % / 82** · 7,5 s 10 % / 12. Con 15 manos a 3 s, banda de la
  guía 85–99 en los 4 muros. Es un lavado beis de sala entera que sube ×4 en un segundo: la grieta queda tapada y es lo contrario de
  «pico menos cargado» (el ≤ 35 % del constructor se midió en el instante de la grieta, no después).
**Qué arreglar y cómo lo compruebo**: que lo que sigue a la grieta no encienda toda la placa (la luz se queda en la grieta y en las celdas
junto a ella, el resto bajo, como dice el diseño). Re-check: la misma serie `pk4_<ms>` (4 manos, `bloomNow` 1 s tras fijarlas, disparos a
1,5 / 2 / 2,5 / 3,5 / 5 / 7,5 s): **% > 40 ≤ 35 en todos los instantes** y media de la tira ≤ 50; y 15 manos a 3 s, banda de la guía ≤ 60.
**Corrección del director (00:00, DECISIONES 24-11)**: el lavado es la floración pedida (T-018). Criterio nuevo SÓLO para 'bloom': la media sube
≤ ×2 por segundo, ≤ 2 % de píxeles a 255, una vez por pase y sólo con 'bloom' (picos normales ≤ 35 %), calma en ≤ 8 s. Con mis números rompe
la primera (×2,1 entre 1,5 y 2 s y ×2,1 entre 2 y 2,5 s; media 24 → 105 en 1 s). Re-juicio conjunto T-014b/T-018 cuando 3D-FE entregue.

### T-011 castell en calidad alta (3D-FE) — **PASA** (23:58)
fps (§3, ventana 23:50, `others=0`, dos corridas): tronc high **49,3–49,8**, baixada high **46,3** fps-eq (≥ 45 ✓; antes 33 y 37–38).
Aspecto (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/t011/baixada_before_after.png`: arriba antes de T-011, en medio ahora): mismo castell de cuerpos de luz, mismo tamaño y brillo;
ahora la bajada suelta teselas que caen (nuevo, se lee como bajada). No pierde el aspecto. Capturas sin errores.
**Para INT (no bloqueante)**: a los 9 s de saltar a tronc el cartel «III · TRONC» se funde **encima** de «PRESS ON THE BEAT»
(`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/t011/../t011/tronc_before_after.png`, abajo): dos textos superpuestos durante el fundido; a los 11,5 s ya está limpio.

### pom3d final (T-008 pasos 2–3) + salida v2 — **PASA** (23:47)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pom3/board1.png` (subida progress 0 / 0,15 / 0,4 / 1 + 4 manos) y `board2.png` (leave 0,05 / 0,1 / 0,2 / 0,3 / 0,4 / 0,6). 13 capturas sin
errores; **WebGL2 igual** (progress 1: banda idéntica al decimal). Costura ≤ 6,8.
- Subida con paralaje como antes; torres de brasas como columnas de cuerpos de partículas; balcones en las fachadas (se leen poco a esta
  escala, no estorban). 4 manos: halos y constelación, banda ≤ 53.
- **Salida v2**: ahora la ciudad y las nubes se apagan poco a poco entre 0,05 y 0,3 bajo las grietas de oro (el «pop» que señalé ha
  desaparecido); los fragmentos se sueltan desde la enxaneta; banda de la guía 13–37 en toda la serie, salto máximo entre pasos 9.

### T-013 brasa3d (3D-BR) — **PASA** (23:43)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/brasa13/board.png` (arrive 0,1 / 0,2 / 0,3, progress 0,6, reward, 15 manos, 1 mano). 8 capturas sin errores; WebGL2 igual.
- **Las esquirlas que caen en arrive ya se ven**: losas con canto rojo encendido cayendo de lo alto (0,1–0,3) y prendiendo el lecho al tocarlo.
- **Humo en penachos**: columnas pardas tenues sobre el lecho (más en reward), no velo. Sutil y sin quitar lectura (banda 18–22 sin manos).
- **Techo de grupo** (aviso mío): 15 manos a progress 1 → banda media 55–103, p99 209–244 (antes 79–124 / 227–243): baja, pero no a los
  36–65 que da el constructor (otra condición: él mide a otro progress o instante). En la imagen hay ~10 diablos a la vez (los de mano + los de
  ola). No bloquea; si se quiere más calma en grupo, el número a mirar es P4 media 103.

### T-005 res-obra3d (INT) — **PASA** con dos avisos (23:40)
- **Pase sin errores**: 11 tramos (`jump` a cada bloque, ritmo 8, `group=4` manos virtuales, 4,5 s + 8 s de traza del score,
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/obra_smoke.log`): 0 errores en todos; el score recorre wait→intro→brasa(title/play/reward)→pinya, crown→festa→baixada, y pom,
  baixada, fall y acta llegan a acta→wait→intro. (Ojo: `review.html` necesita un clic para empezar; sin él se queda en wait: una prueba
  de humo con review sin clic no prueba nada.)
- **Cada bloque con su mundo** (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/obra/board1.png`, `board2.png`, calidad medium, 9 s tras saltar): espera con brasas y la
  línea; intro (oscura a los 9 s, como debe); brasa; pinya; tronc y baixada con el castell grande a 6,5 m sobre la plaza; pom en la
  plaza; crown con festa3d; festa; fall; acta «2 de 7 · DESCARREGAT». 
- **Transiciones cruzadas como fragmentación** (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/obra2/board.png`, a 2,5 s de cada cambio): intro→brasa (esquirlas de la
  plaza + brasa que prende), brasa→pinya, pinya→tronc (la multitud se rompe mientras la plaza se rearma), tronc→pom (teselas de
  trencadís), crown→festa, festa→baixada, baixada→acta: se ven las dos cosas a la vez, en trozos. **Aviso 1**: pom→crown a 2,5 s está
  **negra en los cuatro muros** (banda 0–11) y sin palabras: no se cruza. Puede ser por el salto (en el pase real pom acaba distinto);
  re-check en el pase real con el público virtual (review.html con clic) en ese cambio.
- **Guía legible**: carteles y líneas en todos los bloques sobre placa oscura (`board1/2`); dianas a 1,25 m; banda de la guía
  ≤ 94 de media en todos los bloques (tronc/baixada P1 89–94 por el castell detrás: se lee).
- **fps de la obra** (§3): medium ≥ 56 fps-eq en todos los bloques; **aviso 2**: high en tronc/baixada 37–38 (T-011 sigue), intro 49–50.
- Tirones en transiciones reales ≤ 70 ms; costura con bloom arreglada (7).

### T-008 paso 4 pom3d, fibras: ¿parpadeo entre frames? — **PASA** (23:39)
Instrumento `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/shimmer.js` (eval): copia un parche de 600×300 px tras 12 renders seguidos de la página y mide |Δluma| entre frames
consecutivos y el % de píxeles que cambian > 40. **Control positivo**: festa3d con resonancia 1 da 28 % de píxeles que saltan (se mueve
mucho por frame); el grano solo da 0,001 %. pom3d progress 1, parche de nubes (41 % de píxeles encendidos): **0,007 %** con viento, 0,001 %
sin viento, 0,001 % sin fibras. Las fibras de 1 px no parpadean.
**Hallazgo para 3D-FE (no es un veredicto)**: festa3d con resonancia 1 cambia el 28 % de los píxeles más de 40 de luma **en cada frame**
(resonancia 0: 3 %; 0,5: 2 %; sin bandas 30 %; sin arena 19 %): no es la arena ni las bandas, son las curvas de nivel que saltan de sitio
frame a frame (la luma media del parche se queda en 33–39: no es un estrobo de toda la sala, es imagen que «hierve»). Con una oscilación
cerca de la frecuencia de frame eso se ve como parpadeo. Hay que mirarlo en movimiento (un fotograma no lo enseña).

### T-003 pom3d, salida (3D-PO, re-check) — **PASA** (23:35)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pom2/` (`board.png`: leave 0,02 / 0,06 / 0,12 / 0,3 / 0,5 / 0,8 en WebGPU y 0,12 en WebGL2; 14 capturas, sin errores).
- Banda de la guía, media por muro, leave 0,02 → 0,8: 18–36 / 18–33 / 19–37 / 24–34 / 24–33 / 17–28 / 2–11. **Máx. 37 (≤ 60 ✓)**, salto
  máximo entre valores seguidos 11 (≤ 25 ✓). **WebGL2 igual al decimal.**
- Imagen: la noche se agrieta en oro, los triángulos llevan el cielo y el suelo oscuros, se sueltan desde la luz de la enxaneta, algunos
  destellan en oro y derivan, y la sala queda negra con la estrella. Es fragmentación y ya no hay fogonazo.
- **No bloqueante**: entre 0,06 y 0,12 la ciudad, las nubes y las torres desaparecen de golpe de los fragmentos (queda un cielo y un suelo
  lisos): un «pop» de contenido, no de luz; la malla sigue muy regular.

### T-010b festa3d (3D-FE, re-check de la regresión) — **PASA** (23:31)
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/festa10b/patch_cmp.png` (recorte x 4650–4950, de izquierda a derecha: T-004 / T-010 / **T-010b** default; T-004 / T-010 / **T-010b** 2 manos
sin auto; T-010 / **T-010b** 15 manos; T-010b crown 0,6; T-010b WebGL2): el parche de bandas rotas ya no está en ningún estado con
resonancia 0. `board.png`: resonance 0 / 0,5 / 1 → las bandas sólo aparecen con resonancia alta (a 0,5 ninguna; a 1 perla y oro, sin verde).
7 capturas sin errores; WebGL2 sin errores. Banda de la guía: default 5–6; 15 manos 20–42; crown 0,6 53–66 (≤ 199 p99); res 1 39–44.
El resto de T-010 se mantiene (coronación con claroscuro, sin línea arriba, WebGL2 15 manos + res 1 = 94 fps-eq).

### T-002 / T-007 pinya3d (3D-PI, re-check) — **PASA** (23:29)
Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pinya7/` (`board.png`: fill 1 / 2 manos +3 s / 15 manos / closed / dry / leave 0,45; `zoom.png` frente a `caps/pinya/zoom_bodies.png`).
- Humo: 12 capturas sin errores; WebGL2 sin errores e idéntica en la banda. fps (§3, 23:16): 162–164 fps-eq; closed + 15 manos 135; WebGL2 105.
- **Banda de la guía** (lo que pedí): fill 1 media **31–35** (≤ 60 ✓, antes 110–123), p99 88–100; closed **59–70** (≤ 80 ✓, antes 137–152);
  dry 41–47; 15 manos 56–87 (p99 ≤ 198). La guía ya no queda delante de una franja clara.
- **Imagen**: una masa apretada de cuerpos de arcilla continuos, oscura, con variedad de complexión y pose; el calor entra donde está la
  mano (la figura que aprieta la palma y los de detrás se encienden, `zoom.png`); la rotllana se lee como brazos enlazados; dry abre grietas de
  esmalte. Se lee como gente a 3–6 m y ahora tiene claroscuro. Llegada y salida en trozos, como antes (bien). Costura ≤ 3,6.
- **No bloqueante** (T-012, ya abierto): brazos alzados finos como antenas; la porcelana/perla translúcida del ARTE apenas se ve (se lee
  arcilla); los pies de la fila de delante flotan en el negro.
- `create()` 4 ms en mi medida; tirón brasa→pinya en res-obra3d 31 ms (§3).

### T-001 (re-check) y T-009 brasa3d (3D-BR) — **PASA** los dos (23:27)
Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/brasa9/` (`board1.png` progress 0,6 / 1 / 2 manos +1,2 s / 15 manos / reward; `board2.png` arrive 0,2 / 0,45, leave 0,35 / 0,6 /
0,7 / 0,85; `zoom.png` losas subiendo a leave 0,6 y un diablo).
- Humo: 13 capturas sin errores; WebGL2 sin errores. fps (§3, ventana 23:16): 91–93 fps-eq; 15 manos 81; WebGL2 15 manos 73.
- **Salida (lo que falló en T-001)**: píxeles con luma ≥ 25 por encima del lecho, por altura en el muro — leave 0,35: 1,15–1,8 m 25 284 ·
  1,8–3 m 12 612 · > 3 m 1 448; **0,6: 7 848 · 19 400 · 7 468** (el grueso arriba), máx. 244; 0,7: 1 116 · 12 992 · 2 936; 0,85: 20 · 300 ·
  256 (casi negro). `zoom.png`: losas con canto de luz y destellos de espejo, girando y separándose. Ahora se lee como fragmentación. PASA.
- **T-009**: diablos a paso humano (una figura por mano, `board1` fila 3; en 15 manos el corro de diablos alrededor de la sala es lo más vivo
  de la obra); humo como velo pardo tenue sobre el lecho (sutil, no quita lectura: banda 20–32 sin manos); ola por la costura: salto 5,8
  (dentro de muro 24–36). Reward: cuatro hogueras y tierra fría, bien.
**No bloqueante** (ya en T-013): las esquirlas que caen en arrive 0,2 siguen casi invisibles (banda 0,0); con 15 manos la franja del lecho
sigue muy clara (media 79–115, p99 237–241).

### T-010 festa3d, pulido (3D-FE) — **FALLA** (una regresión; lo pedido está bien) (23:12)
Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/festa10/` (`board.png`: default / crown 0,35 / 0,6 / 0,85 / resonance 1 / 15 manos; `t004_vs_t010.png`; `artifact_all.png`).
- Humo: 11 capturas sin errores; WebGL2 sin errores. **fps**: 122 fps-eq; WebGL2 15 manos + resonance 1 = **94** (pedía ≥ 50: pasa).
- **Coronación**: ya no es una capa plana: celdas oscuras con la luz en las grietas; banda de la guía crown 0,6 media 57–62 (antes 71–86).
  Bien. **Línea de arriba**: está a crown 0,35 (~9 s, el destello aún se apaga, como dice el constructor) y ha desaparecido a 0,6 y 0,85.
  Bien. **Bandas a resonance 1**: sin verde, tonos perla/oro (`res1_zoom.png`). Bien.
- **Regresión**: en P2, u ≈ 0,55–0,70 (x 4650–4950 de la tira), aparece **un parche fijo de bandas rotas** (líneas cortadas en guiones,
  tiras verticales) **con resonancia 0**: en `default`, `noauto2h_1s` (sin auto), `h15`, `crown_0.6/0.85`, `webgl2`. En T-004 ese sitio
  estaba limpio (`t004_vs_t010.png`: tres de la izquierda T-004, tres de la derecha T-010). Se lee como un fallo de imagen fijo en un muro.
**Qué arreglar y cómo lo compruebo**: que el efecto de bandas sea 0 cuando la resonancia es 0 (y fuera de coronación/llegada/salida);
probablemente una máscara o un umbral que no está a 0 en esa zona (¿el bloque «raro» o el Voronoi de `U.cells`?). Re-check:
`capture.py … default '{}'` y `noauto2h_1s` → recorte x 4650–4950 igual de limpio que T-004; y `res1` con las bandas como ahora.

### T-003 pom3d (3D-PO) — **FALLA** (sólo la salida: fogonazo) (23:05)
Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pom/` (hojas `board1.png` subida progress 0 / 0,15 / 0,4 / 0,7 / 1 + 3 manos; `board2.png` arrive 0,2/0,5/0,8, leave
0,2/0,5/0,8, 15 manos; `board3.png` leave 0,02 / 0,06 / 0,12 / 0,3).
- **Humo**: 23 capturas sin errores; **WebGL2** sin errores e idéntica (`webgl2_strip.png`, banda igual al decimal).
- **fps** (§3): 6,2–7,3 ms = 137–160 fps-eq; WebGL2 143. **15 manos: 12,1 ms = 83** (cada mano cuesta ~0,35 ms; hay margen, pero es
  la única pieza que casi dobla con el grupo: revisar el bucle por mano de la capa de manos).
- **Manos**: 1 frame (18 ms; luma 13 → 27 el primer frame, corazón de oro), y el halo azul crece en 2 s; dos manos cercanas se unen
  con línea de constelación (`p07_2h_2s_strip.png`). 15 manos (`h15`): constelación por toda la sala, sin saturar (banda media 35–66).
- **La subida se siente (paralaje)**: sí. 0 plaza a pie de calle → 0,15 fachadas que bajan → 0,4 tejados y campanarios → 0,7–1 la ciudad
  abajo, el horizonte del mar, las nubes de fibras alrededor. Las nubes de fibras son de lo más bello de todas las piezas. Fachadas
  planas (lo dice el constructor): no bloquea.
- **Costura / esquinas**: hilo de oro, nubes y horizonte continuos (`*_seam.png`, salto ≤ 6 como dentro de un muro).
- **Llegada = fragmentación**: sí, preciosa: torres de trencadís que se abren de arriba abajo en teselas que vuelan y se vuelven
  estrellas (arrive 0,2–0,5).
- **Salida**: la idea (grietas de oro sobre la noche que se rompe en triángulos) se ve bien a leave 0,06. Pero **entre leave 0,06 y 0,12
  toda la sala se inunda de beis claro**: banda de la guía media 38–48 → **145–148**, p99 234, en los 4 muros a la vez, y sigue así hasta
  ~0,3; a 0,5–0,8 los fragmentos son triángulos dorados muy claros. Es un fogonazo de sala entera (×3,5 de luz en ~0,3 s si la salida
  dura 5 s) justo donde está la guía, y la noche desaparece en vez de romperse. Contra la casa («nada de destellos bruscos») y contra el
  criterio de la banda. Además la malla de grietas es una icosfera muy regular.
**Qué arreglar (3D-PO) y cómo lo compruebo:**
1. Los fragmentos deben **llevar la imagen de la noche** (cielo, ciudad, estrellas: oscuros) con las grietas de oro como única luz; nada de
   relleno beis. Si hay un brillo de espejo al girar, que sea por fragmento y breve, no de toda la superficie a la vez.
2. Criterio numérico: en `leave_0.06`, `leave_0.12`, `leave_0.3`, `leave_0.5` (`…?part=pom3d '{"progress":1,"leave":X}' --delay 5000`)
   la **media de la banda de la guía ≤ 60** en los cuatro muros y sin salto > 25 entre dos valores consecutivos de esa serie.
3. (No bloqueante) romper la regularidad de la icosfera (subdividir con ruido) y mirar el coste por mano.

### T-002 pinya3d (3D-PI) — **FALLA** (por la imagen; lo técnico pasa) (23:00)
Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/pinya/` (hojas `board1.png` estados: dormidos / fill 0,6 / 2 manos +3 s / 15 manos / closed / dry; `board2.png` arrive 0,2/0,5/0,8
y leave 0,2/0,45/0,7; detalle `zoom_bodies.png`; costura `seams_board.png`).
- **Humo**: 16 capturas sin errores; **WebGL2** sin errores e igual (`webgl2_strip.png`). **fps**: 5,6 ms = 179 fps-eq (15 manos 161; WebGL2 222).
- **Manos**: 1 frame (17 ms, luma 130 → 180 en 70 ms, §3b); a los 3 s la figura que sale a apretar la palma está sobre la mano
  (`zoom_bodies.png`, izquierda): es la mejor idea de la pieza y se lee.
- **Costura y esquinas**: cuerpos, filas y la figura que aprieta cruzan P3→P4 sin corte. El halo de una mano junto a la costura se corta:
  es el bloom de `room3d` (ver traspaso al director), no de la pieza.
- **Llegada / salida = fragmentación**: sí, y bien: leave 0,45 = los cuerpos estallan en trozos de arcilla y porcelana que suben girando;
  0,7 = se adelgazan; 0,9 = negro. arrive 0,2 = ceniza dispersa; 0,5 = nube de piezas que encaja; 0,8 = multitud entera.
- **Se leen como personas a 3–6 m**: sí, pero como **maniquíes de dibujo articulados** (costuras de primitivas a la vista, todos iguales,
  misma pose, filas regulares y separadas, pies flotando en el negro sin suelo).
- **Banda 0,9–1,6 m**: la multitud ocupa exactamente la banda de la guía como una **franja beis uniforme y clara en los 4 muros**: fill
  0,6–1 media 109–125 / p99 173–177; closed 137–152 / p99 219–222; dry 121–142 / p99 211–215. No hay blancos que deslumbren, pero es
  la superficie clara más grande de todas las piezas y está justo detrás de la guía (la guía quedará en contraluz).
- **Belleza frente a las referencias**: no llega. ARTE.md pide cuerpos de **porcelana o perla translúcida, apretados, que se calientan e
  iluminan por dentro** donde se sostienen; la casa pide «mucha oscuridad con poca luz bien colocada». Lo que hay es una luz plana y
  pareja sobre cientos de copias de un maniquí mate: friso de figuritas, sin claroscuro ni materia (el resplandor bajo la piel no se ve).
  Frente al intro t 48–62 (piedra y espejo con luz rasante y negro profundo) se ve de catálogo, no de obra.
**Qué arreglar (3D-PI) y cómo lo compruebo** (mismas etiquetas de `capture.py`, `--query` no hace falta: `…?part=pinya3d`):
1. **Luz**: multitud oscura por defecto; la luz es la del calor bajo la piel (oro / rojo profundo) y un borde de perla rasante desde
   arriba, no una luz general. Objetivo: banda de la guía con fill 1 **media ≤ 60** (hoy 110–123) con brillos p99 ~180; closed ≤ 80.
2. **Materia**: porcelana / perla translúcida (transmisión por los bordes finos, brillo interior visible donde la mano empuja); que no
   parezca madera mate.
3. **Cuerpos**: esconder las costuras entre primitivas (normales suavizadas o mezcla suave entre piezas), variar por instancia escala,
   inclinación de cabeza y brazos, y **apretar** la masa (hombro con hombro, filas que se solapan: una pinya es un bloque).
4. **Suelo**: los pies no pueden flotar; un mínimo de luz en las terrazas o que la masa se pierda abajo en la sombra.
Re-check: `fill06`, `fill1`, `closed`, `f06_2h_3s`, `h15`, `leave_0.45` → banda (meta) y mirada contra `zoom_bodies.png`.

### T-001 brasa3d (3D-BR) — **FALLA** (sólo la salida) (22:50)
Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/brasa/` (`capture.py`; hojas `board1.png` estados, `board2.png` + `board3.png` llegada/salida, `frag_zoom.png`).
- **Humo**: 25 capturas sin errores (progress 0/0,6/1, 2 y 15 manos, olas por la costura, awake, arrive 0,15/0,3/0,45/0,8,
  leave 0,2/0,35/0,5/0,6/0,7/0,85, reward). **WebGL2**: `webgl2_strip.png`, backend webgl2, sin errores, igual que WebGPU.
- **fps** (§3): 7,3 ms = 135 fps-eq; progress 1 + 15 manos 8,8 ms = 114; WebGL2 progress 1 + 15 manos 9,7 ms = 103. Con margen.
- **Manos al instante**: 1 frame, 15 ms (§3b); `p06_2h_strip.png` (+100 ms): fuente de chispas y destello ya en la mano; a 1,2 s un diablo
  por mano (`p06_2h_1s`). Precioso: el correfoc se lee.
- **Costura**: una ola cruzando P3→P4 (manos en P3 u 0,92 y P4 u 0,08; `seamwave_0/1/2_seam.png`): lecho, llamas y chispas continuos.
  Hay un salto de luz en el halo de un diablo junto a la costura (luma 15 → 54, `seamwave_1_seam.png`), **pero no es de brasa3d**: con
  `bloom: 0` el salto cae de 44 a 7 (≤ el salto normal dentro de un muro, 12). Es el **bloom de `room3d.js`, que no da la vuelta a la tira**
  (sus mips no repiten en x): afecta a toda pieza con luz fuerte junto a P3|P4. Al director (dueño de T-000a). Esquinas continuas.
- **Banda 0,9–1,6 m**: el lecho cae a ~0,85–1,1 m, justo en el borde bajo de la banda. Sin manos: progress 1 media 31–35 / p99 156–184;
  awake 52–62 / p99 197–222. Con 15 manos sube a media 83–124 / p99 229–243 (fuentes y diablos): es la luz de los visitantes, no una
  superficie fija; no deslumbra donde va la guía, pero en grupo esa franja es la más clara de la pieza.
- **Llegada** = fragmentación: sí. 0,15 esquirlas oscuras colgando arriba; 0,3–0,45 caen y los tramos del lecho prenden por piezas; 0,8
  lecho entero. Tenue pero se lee y es bello.
- **Salida** = fragmentación: **no se lee**. leave 0,35 / 0,5 / 0,6 / 0,7 (`board3.png`, `frag_zoom.png`): las esquirlas quedan grises y
  quietas a la altura del lecho (~1 m), no suben ni giran ni brillan como espejo; lo que se ve es el lecho apagándose y unas motas rojas.
  PARTS.md pide «breaking into fragments that drift up and apart, turning, catching the light like mirrors». A 0,85 ya no queda nada.
- **Belleza**: el estado base (una sola línea de brasa ondulando alrededor de la sala, todo lo demás negro) es contenido y elegante; los
  diablos con la forca y las carretilles son lo más vivo de las piezas. Bien frente al intro.
**Qué arreglar (3D-BR) y cómo lo compruebo:**
1. Salida: entre leave 0,2 y 0,8 las esquirlas deben **subir** (a leave 0,6 el grueso entre 1,8 y 3 m de altura en el muro, separándose),
   **girar** y dar **destellos de espejo** (cara que capta la luz cálida del lecho o del cielo, breve y escasa), y adelgazarse hasta 0 a ~0,9.
   Re-check: `python3 capture.py <out> leave_X …?part=brasa3d '{"progress":0.6,"leave":X}' --delay 5000` con X = 0,35 / 0,6 / 0,7; paso si a
   0,6 las esquirlas visibles están mayoritariamente por encima de 1,8 m y alguna brilla (luma ≥ 150) y a 0,85 casi negro.
2. (No bloqueante) Con 15 manos la franja del lecho se acerca al blanco (p99 243): si sobra margen, techo algo más bajo para el grupo.

### T-004 festa3d (3D-FE) — **PASA** (22:45)
Capturas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/festa/` (`capture.py`, demo=0, seed 7; `<etiqueta>_meta.json` con el reloj del disparo y la banda de la guía).
- **Humo**: 17 capturas, `errors: []` en todas (festa, crown 0,1/0,35/0,6/0,85, resonance 1, bloomNow, arrive 0,15/0,4/0,7,
  leave 0,1/0,4/0,75, 2 y 15 manos). **WebGL2**: `webgl2_strip.png`, backend webgl2, sin errores, misma imagen.
- **fps** (§3): 8,9 ms = 112 fps-eq; 15 manos 10,7 ms = 93; bloom + resonance 1 + 15 manos 11,0 ms = 91. WebGL2 15,4 ms (65) y con 15
  manos 20,4 ms (**49**: el respaldo justo bajo 50; no bloquea, el camino principal es WebGPU).
- **Manos al instante**: latencia 1 frame (28 ms en P2, 12 ms en el borde de P3; §3b). `noauto0` vs `noauto2h` (+100 ms): diferencia media
  de luma 26,9 junto a la mano de P2 y 21,9 en la de P3, 4,5 en un muro sin mano. `hand_P2_zoom.png`: anillo de oro limpio que sale de
  la mano. **2 manos → ondas claras** (`noauto2h_1s_strip.png`: anillos que interfieren alrededor de la sala). **15 manos → no satura**
  (`h15_strip.png`: filigrana densa pero legible, el fondo sigue negro, banda de la guía media ≤ 26).
- **Costura y esquinas**: `*_seam.png` de default, res1, crown 0,85, arrive 0,4 y 2 manos con una en P3 u 0,97: las curvas de nivel y
  las celdas cruzan P3→P4 sin corte ni salto (`seams_board.png`); esquinas c41/c12/c23 continuas (`corners_board.png`).
- **Llegar / irse = fragmentación**: arrive 0,15 = esquirlas oscuras y chispas flotando; 0,4 = celdas con borde de oro que se juntan; 0,7
  = placa casi cerrada. leave 0,4/0,75 = celdas sueltas y esquirlas que caen y se apagan. Se lee como el lenguaje de PARTS.md.
- **Banda 0,9–1,6 m** (media / p99 de luma en el centro de cada muro): festa 3,5–12,6 / 60–156; resonance 1 35–40 / 190; crown 0,6
  71–86 / 191–199 (la más clara; sin blancos: máx. 236). arrive 0,4 tiene p99 246 en P4 por chispas puntuales, sin superficie
  deslumbrante. Nada deslumbra donde va la guía.
- **Belleza**: el estado base (filigrana de oro fina sobre negro profundo, neblina roja baja) y la respuesta a la mano son de lo mejor
  que se ha visto en 3D: contención, poca luz bien puesta, como el intro. La llegada en esquirlas casa con el intro t 48–62.
**No bloqueante, para 3D-FE si hay tiempo** (comprobar con las mismas etiquetas de `capture.py`):
1. Coronación 0,35–0,85 (`crown_0.6_strip.png`): una capa beis plana cubre toda la sala y las celdas son demasiado regulares (lo dijo el
   propio constructor). Pierde el claroscuro: dejar oscuro el fondo de las celdas y la luz sólo en las grietas y la lluvia.
2. Línea blanca fina fija en lo alto de los 4 muros en coronación (y ≥ 3,5 m): ¿es el destello? Si es la arena bajo el techo, quitarla.
3. resonance 1 (`res1_strip.png`): las bandas de pixel-sort llevan tiras verdes; fuera de la paleta oro/perla/rojo. Bajar `bands` o quitar el verde.


## Humo del pase final (para las 07:00): `review.html` con clic
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/review_smoke.js` (eval): hace clic en `#start` (el gesto que la página espera; el sonido sigue silenciado por la ventana de humo) y
traza el score 9 s. **Control positivo**: la traza tiene ≥ 2 bloques/fases y el público virtual pone manos. Prueba 23:42 (`from=brasa`,
ritmo 8, 6 personas, q3 low): wait → brasa/title → play → reward → pinya/title → play, 9 manos, 0 errores, `advanced: true`.
**Control negativo**: sin clic, 12 s después sigue en `wait/play` con 0 manos. Uso: `node lab/tools/check.mjs
"/experiments/res-obra3d/review.html?people=6&from=<bloque>&q3=low&params=%7B%22pace%22%3A8%7D" --delay 3000 --size 1800x700
--eval-file review_smoke.js` por cada bloque (los 15 s no dan para el pase entero).


## Cola pendiente al cerrar (00:18, límite de uso alcanzado; orden del director)
1. **T-014b / T-018 festa3d**: re-juicio conjunto cuando 3D-FE entregue: rampa de la floración (≤ ×2/s, ≤ 2 % a 255, una vez, calma ≤ 8 s;
   serie `pk4_<ms>`), parpadeo a resonancia 1 (`shimmer.js`, ≤ 5 % de saltos), coronación.
2. **T-012 pinya**: brazos alzados (re-check `press3s`, `closed`).
3. **INT**: robustez (LiDAR con trazos duplicados, arranque de 2 personas, abandono Pinya/Tronc → wait, partes creadas al cargar; control
   pom 18 → 13 aterrizajes); el texto doble de intro→brasa (arriba); texto partido de Tronc con pisos (no verificado); pom→crown negro a 2,5 s
   en el pase real (review con clic, `review_smoke.js`).
4. **3D-BR**: T-020 la espera (con INT), banda de 15 manos (52–56 / 20–22 / 45–51 / 29–34 según 3D-BR, re-medir con `h15`), fall3d intent
   desde Pom (tras ~02:00), llegada/salida de brasa en la obra (`t022/`), fps de brasa en la próxima ventana.
5. **baixada3d (T-015)** con el destello, tras la atenuación de plaza y atmos de INT.
6. **07:00**: humo final con `review_smoke.js` por tramos (control positivo y negativo descritos arriba) y una ventana de GPU: obra entera
   medium/high, brasa tras T-013/T-020, festa tras T-018.
Herramientas en `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/`:
`bench.sh`/`bench.js` (fps, vigía `others`), `capture.py` (tira, muros, costura, esquinas, banda, `--pins`, `--js`), `latency.js`,
`hitch.js`, `shimmer.js`, `review_smoke.js`. Ninguna ventana de QA queda abierta.


## Humo final (04:46) — **PASA** (pinya se repite después de las 05:30 por orden del director)
`review.html?people=6&q3=low&params={"pace":8}`, clic en `#start` con `review_smoke.js`, un tramo por bloque, 9 s de traza; hoja `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/final/sheet.png`,
registro `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/final/log.txt`. **0 errores en los 11 tramos.**
- **Control negativo** (sin clic, 11 s): sigue en `wait` (una mano de demo del arnés, ninguna del público). ✓
- **Control positivo**: en todos los tramos la traza avanza y el público pone manos (1–10):
  wait→intro · intro→brasa/title · brasa title→play→reward→pinya · pinya title→play · tronc title→play · pom title→play→reward→crown ·
  crown→festa · **festa→baixada** · **baixada→acta** · fall→acta→wait→intro · acta→wait→intro. El pase entero wait→acta→wait queda cubierto
  y sin agujeros.
- A la vista (hoja): carteles y dianas legibles en todos los bloques; tronc con el texto partido «KEEP IT STRAIGHT / HOLD BOTH SIDES · floor 9»;
  crown con la noche de pom rompiéndose; festa con la grieta; baixada armándose sobre la arena de festa; acta con créditos sobre negro.
- Pinya en la obra se ve más pareja y clara que pinya3d sola (lo que dice 3D-PI): pendiente de la repetición a las 05:30 con la comparación.

### Repetición a ritmo 1 (04:55) — **PASA** los cuatro
`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/qa/caps/final1/sheet.png` (review con clic, 6 personas, ritmo 1; t del bloque en el disparo: brasa 3,0 · crown 8,1 · baixada 9,1 · pinya 9,6). 0 errores.
**Corrección de la hoja de 04:46**: aquel ritmo ×8 comprimía los cruces y los fundidos; el «baixada» de entonces era un cruce y el «crown» gris era
el fundido a ×8. A ritmo 1:
- brasa +3 s: sólo «I · BRASA / Awakening» en los 4 muros, sin RESSONÀNCIA; 72 % bajo 15. ✓
- crown +8 s: «CROWNED · 2 de 7» blanco cálido y legible sobre la filigrana; aviso: la sala está muy llena de curvas de oro (19,5 % bajo 15). ✓
- baixada +9 s: castell en dos muros soltando teselas, diana y texto claros, plaza en penumbra; 51 % bajo 15. ✓
- pinya +9,6 s: multitud oscura, calor sólo donde están las manos, dianas legibles; 89 % bajo 15 (más oscura y menos pareja que antes). ✓

## Hallazgos y trampas
- La espera de `check.mjs` no es el reloj de la pieza: la carga se come ~0,3–1 s. Leer siempre `clock` del `_meta.json`.
- `demo=0` en capturas y medidas: si no, a los 4 s sin entrada salen manos virtuales y cambian imagen y coste.

## Traspasos a otros roles
- **[ARREGLADO 23:04, re-comprobado]** **Director (room3d, T-000a)**: el bloom de `room3d.js` no da la vuelta a la costura: un halo junto a P3|P4 se corta (brasa3d: salto 44 de luma con bloom, 7 sin bloom; `caps/brasa/seamwave_1*_seam.png`). Afecta a todas las piezas. Re-check: misma captura con y sin `bloom:0`, el salto debe quedar ≤ 12.
- Todos: para medir fps, `bench.sh` con turno y con `others=0`; los fps del rAF de la ventana oculta no valen (topados y contaminables).
