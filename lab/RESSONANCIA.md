# Ressonància — la obra y cómo está armada

Barcelona XR Lab × Alma Digital Studio · Vicente · 24-11-2026 · para Beltrán

Ressonància es una obra interactiva de unos 10 minutos para la sala VEATION Touch (4 muros, manos por LiDAR, sonido 4.1). El
público construye un castell de luz con las manos: no lo mira, **lo sostiene**. Es guiada (voz, texto en los muros, botones de
mano), funciona con 2 a 15 personas y nadie tiene que explicarla. Todo se genera en vivo por código en Three.js 3D (WebGPU, con
WebGL2 de respaldo): no hay ningún vídeo.

**Estado:** la obra entera corre de punta a punta en el lab, de la espera al acta, con QA pasado bloque a bloque. Falta lo que sólo
da la sala: el LiDAR real, el 4.1 real, la RTX 6000 Ada y escucharla con la imagen.

---

## 1. Cómo verla

En la raíz del repo, rama `lab/vicente`:

```bash
node lab/harness/serve.mjs
```

| Qué | Dónde |
|---|---|
| **La obra entera, con público virtual y sonido** | http://localhost:8780/experiences/res-obra3d/review.html — tarjeta de inicio: capítulo, voz EN/ES, 2/6/15 personas, calidad media (portátil) o alta (sala). Volumen: fader arriba a la derecha o teclas − / + |
| Un capítulo suelto con su panel de parámetros (tecla P) | http://localhost:8780/experiences/res-3d-study/index.html?part=brasa3d (también `pinya3d`, `tronc3d`, `pom3d`, `festa3d`, `baixada3d`, `fall3d`, `actatext`) |
| La intro 3D sola | http://localhost:8780/experiences/res-intro3d/index.html |
| Una captura por capítulo | `lab/estudio/album/01-wait.png … 12-acta.png` |
| La versión 2D anterior (respaldo) | http://localhost:8780/experiences/res-obra/ |

En la app real: la pieza visual es `res-obra3d` y la de sonido `ressonancia-sound`; se lanzan juntas (ver §7, el canal entre ellas).

---

## 2. La idea

**El lema casteller: «Força, equilibri, valor i seny».** Son cuatro valores, como los cuatro muros. La obra los convierte en
capítulos jugables, cada uno con su elemento, su materia y su acción:

| Capítulo | Valor | Universo | Qué hace el público |
|---|---|---|---|
| I. Brasa | (el despertar) | Fuego: brasas, chispas de correfoc, diables | toca: descubre que la sala responde, y que juntos responde más |
| II. Pinya | **Força** | Cuerpo y tierra: una multitud de barro y porcelana | sostiene: llena la base con muchas manos |
| III. Tronc | **Equilibri** | Piedra y cerámica: el castell sube con trencadís | pulsa al ritmo y mantiene la torre recta |
| IV. Pom de dalt | **Valor** | Aire y noche: la sala sube sobre Barcelona | se queda quieto y lleva la luz de la enxaneta hasta arriba |
| V. L'aleta y la bajada | **Seny** | Luz: oro que resuena, y luego una lluvia de color | juega libre; después sostiene hasta que el castell baja entero |

**El lenguaje visual: «materia real, quebrada por la vibración».** Piedra, cerámica, cuerpos y fuego se ven materiales; cuando el
grupo vibra junto, se fragmentan, se ordenan en bandas y brillan. La resonancia (impulsos pequeños que coinciden y se suman) se hace
visible. El trencadís, que ya es cerámica rota y reordenada, es el puente.

**La firma de la obra es la fragmentación.** Cada universo *llega* ensamblándose desde fragmentos de su propia materia (esquirlas,
chispas, motas) que flotan, giran y encajan, y *se va* rompiéndose en fragmentos que suben, giran como espejos y se apagan. Cada
cambio de capítulo dura unos 5 s y los dos universos se cruzan.

---

## 3. El recorrido (≈10:30)

| Tiempo | Bloque | Duración (mín–máx) | Interactivo |
|---|---|---|---|
| — | **Espera** entre pases | indefinida | botón de inicio |
| 0:00 | **Intro: La plaça** | 1:10 fija | no |
| 1:10 | **I. Brasa** | 1:00 (0:45–1:15) | sí |
| 2:10 | **II. Pinya — Força** | 1:45 (1:15–2:15) | sí |
| 3:55 | **III. Tronc — Equilibri** | 2:15 (1:45–2:45) | sí |
| 6:10 | **IV. Pom de dalt — Valor** | 1:30 (1:10–2:00) | sí |
| 7:40 | **V. L'aleta**: la coronación | 0:25 fija | no |
| 8:05 | **V. La ressonància**: la fiesta | 1:05 (0:50–1:15) | sí, libre |
| 9:10 | **La bajada — Seny** | 0:40 (0:30–0:50) | sí |
| 9:50 | **Cierre: l'acta** | 0:40 fija | no |

Cada capítulo interactivo tiene tres fases: **enseñar** (cartela de capítulo y la voz dice qué hacer), **jugar** (metas que
crecen) y **premio** (la recompensa y la transición). Un capítulo nunca acaba antes de su mínimo (si el grupo va rápido, hay más
metas) ni dura más que su máximo (la sala lo acompaña y avanza). Un pase dura siempre entre 9:30 y 11:30.

Si la sala se queda sin manos 45 s en mitad de un pase, la obra se recoge con elegancia y vuelve a la espera.

---

## 4. Bloque a bloque (lo que hay construido en 3D)

### Espera
Casi negro. Una línea de brasas respira a la altura de las manos y chispea al tocarla. En cada muro, un botón de mano y «Place your
hands on the wall to begin»: un anillo se llena en 3 s (más rápido con más manos); con dos muros sostenidos empieza el pase.

### Intro: La plaça (70 s, prediseñada)
La sala se convierte en una plaza del casco antiguo de Barcelona de noche, vista desde su centro: fachadas de piedra y estuco,
balcones de hierro, una iglesia gótica con rosetón y campanario, cuatro calles en las esquinas, adoquines mojados, faroles, cielo de
luna y bruma. Los faroles se encienden uno a uno alrededor de la sala (8–22 s); la plaza descansa; a los 46 s vibra y **se rompe en
paneles flotantes de piedra y espejo** que suben y se pierden en lo oscuro. Las cuatro palabras del lema aparecen, una por muro, y
luego RESSONÀNCIA. La voz explica qué es un castell y quién lo construye de verdad: *«Tonight, these walls are the square. And you
are the pinya.»*

### I. Brasa (fuego)
Un lecho de brasas rodea la sala sobre el suelo de la plaza, 4–8 m más allá de los muros, con llamas bajas. **Cada toque levanta un
chorro de chispas de correfoc**; arrastrar deja un rastro de brasas; donde cae una mano nace un *diable* de fuego que baila con dos
carretillas. Metas: 1) cada persona toca una vez (así la sala estima el grupo); 2) «Now, together»: tocar a la vez lanza una ola de
fuego que da la vuelta a la sala, con diables que corren detrás; 3) tres olas encienden el anillo entero.
*Técnica:* 131 072 chispas en GPU (compute TSL), 36 000 llamas, hasta 10 diables de ~4 500 partículas cada uno.

### II. Pinya — Força (cuerpo y tierra)
Más allá de los muros, una **multitud de cuerpos de barro y porcelana translúcida** de pie en cinco anillos concéntricos, hombro con
hombro, respirando, mirando al centro. Están dormidos, casi en negro. **La luz nace donde aprieta una mano:** la multitud se inclina
hacia ella, una figura sale de la oscuridad y apoya su palma de barro sobre la mano del visitante en el muro, y el calor sube por su
brazo. Metas: llenar los círculos de cada muro; con todos los muros necesarios sostenidos a la vez, **el círculo se cierra** y la
multitud baila una rotllana que gira alrededor de la sala.
Cuántos muros se sostienen decide **la estructura del castell**: 2 muros *torre*, 3 *tres*, 4 *quatre*.

### III. Tronc — Equilibri (piedra y cerámica)
Vuelve la plaza, de noche. Más allá de cada muro de la estructura, el castell —cuerpos hechos sólo de partículas de luz, nunca
maniquíes— **sube piso a piso**, y cada piso fijado se viste de **trencadís** vidriado: piedra y hueso abajo, ocre, terracota, rojo
arriba. Cada piso muestra su nombre real (*Segons, Terços, Quarts…*). Metas: 1) **el pulso**: un anillo se cierra sobre el botón con
cada golpe de timbal; manos abajo en el golpe fijan piso (justo en el golpe vale el doble); 2) **el equilibrio**: desde el tercer piso
cada torre tiene dos botones; si falta un lado, la torre se inclina hacia él (hasta ±7°) y tiembla. Resultado: **de 5 a 9 pisos**.
El castell crece más allá del muro a propósito: en el Pom la sala sube a verlo.
Al último piso, **la música se corta en seco** y el trencadís se apaga de arriba abajo.

### IV. Pom de dalt — Valor (aire y noche)
**Vértigo: la sala sube.** El mundo entero se hunde y el punto de vista pasa del suelo de la plaza a ~32 m de altura: las fachadas
bajan, luego las azoteas del casco antiguo (tejas, terrazas, chimeneas, campanarios), el mar de luces de la ciudad, el Mediterráneo
con el reflejo de la luna, Collserola. Nubes fibrosas de líneas azules y violetas pasan por los muros. Tres luces de oro —**dosos,
acotxador, enxaneta**— suben por turnos torres de brasa más allá de cada muro, dejando un hilo de oro. **La luz sólo pasa por los
muros donde hay manos quietas:** el grupo se la entrega de muro en muro. Una mano quieta crece un halo y junta estrellas; manos
quietas cercanas se unen en constelaciones; si alguien se mueve, la luz titubea y retrocede.
Si falla (la sala se vacía o se agota el tiempo antes de la mitad), el castell cae —*intent*— y se pasa al cierre.

### V. L'aleta (25 s, prediseñada) y la ressonància (libre, ≈65 s)
**La coronación:** la enxaneta levanta la mano, un destello de oro recorre lo alto de los cuatro muros, las torres se coronan y la
sala se llena de luz por primera vez. Ruge la plaza.

**La ressonància** es el título hecho visible y la parte más libre de la obra. Los cuatro muros se vuelven una sola placa luminosa
que **resuena** como la piel de un tambor: cada mano lanza una onda de oro que da la vuelta a la sala, cruza las de los demás y, donde
coinciden, se suman. Unas 600 000 partículas de «arena» saltan sobre la placa y se juntan en las líneas nodales (figuras de Chladni).
Sin instrucciones: tocar da una onda y una nota; arrastrar deja estela. **La regla escondida es la del título:** cuanto más a la vez
toca el grupo, más crece la resonancia: las figuras se ordenan, la luz sube por los muros, el oro se vuelve blanco y la imagen se
quiebra en bandas ordenadas. Al máximo, la sala florece una vez (se descubre, no se anuncia). Con 2 personas las ondas son pocas y
nítidas; con 15 la sala hierve, pero queda acotada.
*Técnica:* ecuación de onda 2D en GPU sobre perímetro × altura (periódica alrededor de la sala), ping-pong en dos render targets.

### La bajada — Seny («Luz que llueve»)
Un castell sólo está completo cuando baja entero. Se deshace piso a piso en una **lluvia lenta de esquirlas de colores** (la paleta
del trencadís). **La mano las recoge:** donde hay una mano, una esquirla se detiene a su altura, destella y se apaga en ella. Meta:
seguir sosteniendo mientras baja. Si todos sueltan antes, cae: *carregat*.

### La caída (12 s, prediseñada)
Dos versiones: **carregat** (el castell que está en pantalla se hunde desde la base) e **intent** (tras el Pom, en la oscuridad, se
ensambla el castell que construyó el grupo y la parte alta se derrumba en arco). Grieta luminosa, colapso en fragmentos que caen con
gravedad y se enfrían de oro a brasa a negro, polvo que sube.

### Cierre: l'acta (40 s)
Negro y tipografía montada con partículas de oro. El acta del grupo, como la escriben las colles: **«3 de 7 · descarregat»**
(o carregat, o intent), y luego los cuatro valores, uno por muro —Força, Equilibri, Valor, Seny— medidos según cómo jugó el grupo.
Voz final: *«This was your castell. When bodies resonate together, culture is born.»* Créditos y vuelta a la espera.

---

## 5. Cómo se adapta al grupo (2–15 personas)

- La sala **estima el grupo** por el máximo de manos simultáneas (`personas ≈ manos / 1,6`, entre 2 y 15) y lo corrige durante el pase.
- De eso salen: muros a sostener en la Pinya (2–3 personas: 2 muros · 4–7: 3 · 8+: 4), botones por muro (1, 2 o 3), cuántas manos
  pide cada meta y cuánta quietud tolera el Pom.
- Con 2 personas todo cabe en sus cuatro manos (cada persona puede abarcar una esquina). Con 15, cada muro tiene trabajo para varios.
- Los botones miden 60 cm, a 1,25 m de altura, y cualquier mano cerca cuenta. Nada exige precisión ni velocidad.
- Un muro sigue «sostenido» 2 s después de su última mano (el sensor pierde manos; la gente se mueve).

## 6. La guía (siempre visible)

- **Voz:** una frase al empezar cada capítulo y avisos cortos si el grupo se atasca (como mucho uno cada 25 s). 26 frases en inglés
  (voz Lily) y en castellano peninsular (voz Mía Evans), con las palabras castelleras en catalán.
- **Texto en los muros:** cartela de capítulo (~2,15 m: «III · TRONC — Balance») y una línea de instrucción (~1,9 m), iguales en
  los cuatro muros, en inglés.
- **Botones de mano:** un anillo de 60 cm con una mano dibujada, sobre el plano del muro; se enciende al sostenerlo y un arco muestra
  el progreso. En la Pinya hay más; en el Tronc el anillo se cierra con el pulso.

---

## 7. Cómo está armada

```
lab/experiments/
├── ressonancia/                 el núcleo compartido
│   ├── GUION.md                 el guion (fuente única de la dramaturgia)
│   ├── ARTE.md                  dirección de arte y técnica 3D
│   ├── score.js                 la PARTITURA: toda la obra como máquina de estados pura
│   └── scenes3d/
│       ├── room3d.js            la sala en 3D (CAVE con 4 cámaras off-axis)
│       ├── guide3d.js           botones de mano y texto en los muros
│       ├── PARTS.md             el contrato de una «parte»
│       └── parts/               un módulo por universo o pieza
├── res-obra3d/                  la PIEZA VISUAL: el host que junta partitura + partes
├── ressonancia-sound/           la PIEZA DE SONIDO: lleva la partitura y la música
├── res-3d-study/                banco de pruebas: una parte sola con su panel
└── res-obra/                    la versión 2D anterior (respaldo; su autopilot es el público virtual)
```

### La partitura (`ressonancia/score.js`)
Toda la obra es **una máquina de estados pura**: sin DOM, sin GL, sin audio. Sólo lee lo que la sala sabe de verdad (cuántas manos,
en qué muros, a qué lado del centro de cada muro, cuándo aterrizan, cuán quietas están) y camina los bloques `wait → intro → brasa →
pinya → tronc → pom → crown → festa → baixada → (fall) → acta`. Expone un estado (`block`, `phase`, `progress`, `people`,
`needWalls`, `fill[]`, `beat`, `floors`, `lean[]`, `climber`, `resonance`, `outcome`, `values`…) y emite eventos (`wave`, `close`,
`pulse`, `floor`, `crown`, `bloom`, `down`, `fall`…). Todos los tiempos están en la tabla `TIMES`. La imagen y el sonido sólo leen
este estado: un solo escritor.

### Sonido y visual: quién manda
**Manda el sonido.** `ressonancia-sound` ejecuta la partitura (una copia idéntica de `score.js`), la avanza cada 25 ms con el reloj
de pared y publica su estado en un `BroadcastChannel('ressonancia')`; la pieza visual lo sigue. Así el sonido oye la mano al instante
y es dueño del pulso. Si no llega nada por el canal, la pieza visual corre su propia partitura con las mismas manos.
⚠️ **El BroadcastChannel es un apaño del lab**: el runtime no tiene un canal oficial entre una pieza visual y su pieza de sonido.
Funciona si las ventanas comparten origen; en la app real está sin probar. **Es lo primero que necesitamos de ti** (ver §10).

### La sala en 3D (`scenes3d/room3d.js`)
Un **CAVE**: un ojo en el centro de la sala (a 1,6 m) y **una cámara off-axis por muro** (proyección generalizada de Kooima), cada
muro una ventana exacta a un mundo que sigue detrás. Las cuatro ventanas se tocan en las esquinas, así que el mundo es continuo
alrededor de la sala (P3 → P4 también). Las cuatro vistas se dibujan en **una sola tira HDR** (7196 × 912, HalfFloat, como la espera la
sala) y luego un único pase de post: bloom (que también da la vuelta en la costura P3|P4), tone mapping ACES y un grano contra el
banding. WebGPU si está, WebGL2 si no (Three.js r187, vendorizado, por import map).
Lo que se *lee* (botones, texto) y lo que se toca viven **en el plano del muro**, donde la proyección es exacta para cualquier
visitante esté donde esté; el universo se abre detrás. Lo lejano se lee bien desde cualquier punto; las estructuras grandes van a
≥ 6 m del ojo. Las manos del LiDAR llegan en coordenadas de mundo sobre el plano del muro.

### Las partes (`scenes3d/parts/`, contrato en `PARTS.md`)
Cada universo es un módulo ES con `create(ctx)` → `{ object, update(dt, input), setParams, dispose }`. El host le pasa cada frame
las manos, el estado de la partitura, sus eventos y dos controles de transición, `arrive` (0→1) y `leave` (0→1).

| Parte | Qué es |
|---|---|
| `atmos` | el aire de la plaza: 300 000 motas en GPU, bruma, la línea de horizonte |
| `plaza` | la plaza del casco antiguo, procedural, con su coreografía de la intro y su rotura |
| `introtext`, `actatext` | las palabras de la intro y el acta, en los muros |
| `brasa3d` | I. Brasa |
| `pinya3d` (+ `pinya3d/body.js`) | II. Pinya: los cuerpos (SDF → malla, esqueleto de 15 huesos, tres poses horneadas) |
| `castell` | el castell de luz: cuerpos procedurales con IK, dibujados sólo como partículas |
| `tronc3d` | III. Tronc: el trencadís sobre los cuerpos del castell, piso a piso |
| `pom3d` | IV. Pom de dalt |
| `festa3d` | V. Coronación y ressonància |
| `baixada3d` | la bajada |
| `fall3d` | la caída (carregat / intent) |

### El host (`res-obra3d/experience.js`)
- Carga **todas** las partes al arrancar y precompila todos los materiales (`compileAsync`), para que un universo que llega tarde no
  congele la sala.
- Mapea cada bloque a sus partes y cruza las transiciones (≈5 s, `leave` de la saliente y `arrive` de la entrante a la vez).
- Una parte que no está visible no se actualiza.
- Las luces de luna y cielo de cada parte se quedan en la escena para siempre (a intensidad 0 cuando no se ven): cambiar el conjunto de
  luces obliga a recompilar los materiales iluminados (costaba ~40 ms en cada aparición de la plaza).
- Ajusta la atmósfera por bloque (motas, bruma, faroles) y lleva el reloj de los textos con la partitura.
- Fusiona los trazos duplicados del LiDAR (a menos de 10 cm).
- Calidad: `low` / `medium` / `high` = escala de render 0,6 / 0,8 / 1, MSAA 0 / 0 / 2, densidad de partículas del castell 0,4 / 0,6 / 1.
  Por defecto `high` (la RTX de la sala).

### El sonido (`ressonancia-sound/`)
Una banda contemporánea, cinematográfica y electrónico-ambiental. Las fuentes catalanas (gralla, timbal, tabals, campanas, la plaza,
el crepitar del correfoc) son **materia prima**, granulada y re-afinada, nunca una melodía. Cada capítulo es su propio mundo sonoro y
la música es **adaptativa**: capas (en tres capítulos, los stems de una misma toma, sincronizados a la muestra) que se mezclan según el
estado. El Tronc va a 100 BPM: compás de 2,4 s = el pulso de la partitura. Desde el piso 5, si el grupo pierde el pulso, una segunda
voz se desafina hasta 45 cents y se oye el batido: la resonancia, audible.
**Espacial:** la música en estéreo se reparte en muros pares e impares; lo que viaja (viento, lluvia, plaza) usa rotores alrededor de
los muros; cada mano suena en su muro y en su posición. Muros con filtro de paso alto a 120 Hz; el sub sólo recibe envíos explícitos.
**Archivos:** 61 audios (19 MB, mp3) generados una vez con ElevenLabs (música, stems, efectos, voces) y reproducidos sin red. Es una
excepción a la regla «sin samples» del lab, pedida por Vicente. Prompts y ajustes junto a los archivos.

### Cambios fuera de las carpetas de la obra (todos dentro de `lab/`)
- `lab/harness/kit.js`: un **volumen de escucha** del lab (fader arriba a la derecha y teclas − / +, guardado en el navegador, después
  del limitador; no cambia los niveles de la pieza) y `put` / `lift` para que las simulaciones pongan manos con guion.
- `lab/harness/runtime.js`: `?soundParams={json}` para pasar parámetros a la pieza de sonido (p. ej. `{"lang":"es"}`).
- `lab/tools/smoke.cjs`: un ajuste menor de la prueba de humo.
- `lab/CLAUDE.md`, `lab/CATALOG.md`: el catálogo con las piezas nuevas.

No se ha tocado nada fuera de `lab/`.

---

## 8. Rendimiento y pruebas (MacBook M1 Max, medido)

- Calidad media: ≥ 60 fps en todos los bloques. Calidad alta: Tronc 49, bajada 46, el resto 65–286. Tirones al cambiar de capítulo
  ≤ 30 ms. La RTX 6000 Ada de la sala es mucho más rápida: allí, calidad alta.
- Prueba de humo de la obra entera con público virtual: 11 tramos, 0 errores de consola, a ritmo normal.
- Sonido: pases completos sin errores con 2, 6 y 15 personas; picos medidos por muro y sub dentro del objetivo; archivos ausentes no
  rompen nada.
- Todas las pruebas fueron mudas (ventana oculta de Electron). **Nadie ha escuchado aún la obra con la imagen 3D.**

## 9. Lo que sólo se ve en la sala

Escala real de cuerpos, torres y texto; la luz en las proyecciones; el sonido 4.1 real (el mapa de hoy comparte canales y no tiene
sub); el LiDAR real (con muchas manos quietas el simulado genera trazos nuevos; el host ya fusiona duplicados); el rendimiento en la
RTX 6000 Ada.

## 10. Lo que necesitamos de ti

1. **Un canal entre la pieza visual y su pieza de sonido** en el runtime (hoy: `BroadcastChannel('ressonancia')`, apaño del lab).
   ¿Llega a la ventana de salida en la app? ¿Una ventana de audio oculta frena su temporizador de 25 ms?
2. **El mapa 4.1** de la sala, para enrutar muros y sub como toca.
3. **Una sesión en la sala** para probar LiDAR, escala, luz y sonido juntos.
4. Visto bueno al **audio con samples** (excepción a la regla del lab).

## 11. Dónde está el detalle

- `lab/experiments/ressonancia/GUION.md` — el guion completo, con voces y decisiones.
- `lab/experiments/ressonancia/ARTE.md` — la dirección de arte y la técnica 3D.
- `lab/experiments/ressonancia/scenes3d/PARTS.md` — el contrato de las partes.
- `lab/experiments/res-obra3d/NOTES.md`, `lab/experiments/ressonancia-sound/NOTES.md` — notas técnicas de cada pieza.
- `lab/estudio/` — el proceso: tablero de tareas, decisiones, mediciones, notas de cada rol y el álbum de capturas.
