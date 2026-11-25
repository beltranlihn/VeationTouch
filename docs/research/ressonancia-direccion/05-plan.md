# Ressonància — 05 · Plan de producción de la noche (25-11, 00:30 → 06:30)

Para el director y los cinco agentes. Implementa D1–D10 de `00-direccion.md`, incluidas las notas de Beltrán de esta noche: **D3b**
(posar y sostener: dianas, nada de golpes ni de tempo), **D4b** (paletas de autor), **D5b** (menos negro: curva de luz), **D6b** (un
solo sonido, misma tonalidad y tempo) y **D8** (de 1–2 a 15 personas sin bloqueos). Usa `01`–`04` como fuente. No reabre decisiones. Código en `.data/worktrees/lab-vicente`, rama `lab/ressonancia-studio`;
rutas relativas a `lab/experiments/` salvo que se diga otra cosa. Las anclas `archivo:línea` son de 7a056a2.

**Leído para este plan:** `score.js` entero, `tuning.js`, el tramo de voz/canal de `sound.js`, la cabecera y `lines()` de
`guide3d.js`, el post y la API de `room3d.js`, `PARTS.md`, el reparto de partes del anfitrión, `voice-lines-es.json`, el arnés y
`scripts/integrate-lab.mjs`. **No leído a fondo:** el interior de las partes 3D (≈ 10 000 líneas); los costes de sus tareas son
estimaciones y cada dueño debe confirmarlos en su primera media hora. No se ha lanzado ningún render.

**Tres hechos que condicionan el arranque (00:30–00:50):**

1. El árbol de trabajo tiene **11 archivos modificados sin commitear** (la guardia `canEmit` del Tech/QA en las ocho partes, los
   tres anfitriones y `scenes3d/emit.js` sin seguimiento). **El Tech/QA los commitea antes de que nadie toque una parte**; si no,
   su cambio se mezcla con los de VFX y Modelado.
2. Cinco agentes comparten **un solo árbol de trabajo**: ver §5.0 (reglas de git) y §5.1 (cerrojo de GPU).
3. El arnés sólo tiene **8 manos virtuales** (`lab/harness/kit.js:165`, ciclo G 1·2·4·8): la matriz 1/2/4/8/15 de la D8 exige
   ampliarlo a 16 (Tech/QA, 10 min). La partitura es pura (sin DOM ni GL): su matriz de aforo se prueba **en Node, sin GPU** (§6.1).

---

## 1. Visión de la versión de esta noche (10 líneas)

1. **Espera.** El mosaico responde; al revelarse el anillo, la voz y el texto salen **del muro donde hay alguien**. Sostenerlo abre la plaza.
2. **Intro (≈ 45 s, antes 70).** La plaza de noche tras una *porxada* con columnas en las esquinas, niebla y suelo que continúa el de la sala. Cada mano enciende el farol del porche que tiene encima: un charco de luz de más de 1 m que se queda.
3. **Brasa.** El fuego **prende bajo la mano** y deja brasa en el muro durante un minuto. «Pasad el fuego»: un diable de cuerpo sólido corre de mano en mano (en los dos sentidos; varios a la vez si hay mucha gente). Después la sala llama: se encienden dianas en todos los muros y, cuando el grupo las sostiene a la vez, sale la ola (el timbal la acompaña; nadie tiene que acertar un golpe). Cada ola se nombra. Final propio («La plaza está despierta») o ayudado y dicho («La colla os ayuda»).
4. **Pinya (a la luz de la plaza: cal cálida y sombras marcadas).** Una figura de cerámica, a tamaño casi real y a un metro tras el muro, apoya su palma en la del visitante. Al juntarse, el muro «aguanta» y se dice. Los muros que se llenan deciden la estructura, que **se nombra**: «Es un pilar / una torre / un tres / un quatre».
5. **Tronc (el momento más claro de la noche: porcelana y piedra iluminada).** La torre es del grupo: tiene suelo, sombra arrojada y cuerpos sólidos. Se levanta posando la mano en dianas que suben con los pisos. Cada piso se canta («Cuarto piso») con el texto subiendo con él. Si se inclina, la voz lo dice en ese muro; si tiembla, se salva o **se pierde un piso a la vista**. Los pisos que se consiguen son los que hay hasta el final (5 a 9).
6. **Pom.** La misma torre, vista desde arriba. La luz sube **más deprisa con cada relevo**; moverse la hace resbalar a la vista. El silencio tolera a quien llega tarde, pero no a media sala.
7. **L'aleta y coronación.** La enxaneta levanta la mano, el público la suya, y **se ve el castell del grupo coronado** (su estructura, sus pisos) antes de fundirse en oro. «¡Coronado!» con energía de plaza.
8. **Ressonància (oro luminoso, no oro sobre negro).** Onda libre; luego un eco enseñado: la onda cruza la sala y enciende una diana en el muro de llegada, que espera a que alguien la sostenga («Devolvedla»); luego todos a la vez. El florecimiento tiene tamaño según lo hecho, y se nombra.
9. **Bajada.** Amanecer con capas y bruma. La torre baja piso a piso con las manos (banda a la altura de las manos presentes: un niño llega). Si cruje, se dice.
10. **Acta (muro de cal a la luz de la mañana, tinta oscura y huellas de oro).** «Tres de siete, descarregat», lo que hizo el grupo y lo que ayudó la colla, y «Dejad vuestra mano» grande y con voz. Cada resultado es distinto y la sala lo cuenta.

---

## 2. Interfaces comunes (lo primero que se fija; nadie las cambia sin el director)

La partitura manda. El sonido la ejecuta y difunde su estado (`sound.js:1134`, `{ ...S, events }`); el anfitrión lo copia y lo pasa
a guía y partes (`input.state`, `input.events`). Todo lo nuevo viaja por ahí: **campos en `S` + eventos de cadena**, como hoy.

### 2.1 Estado nuevo en `S` (dueño: Interacción)

| Campo | Forma | Para qué |
|---|---|---|
| `S.n` | número 0–32 | Manos presentes, suavizadas (sube en 0,5 s, baja en 4 s). **Base de todo umbral colectivo** (sustituye a `S.people`, que sale de un pico que tarda 20 s por mano en bajar, `score.js:321-322`) |
| `S.focus` | `{ wall, s, y, kind, at }` o `null` | **El muro que llama.** `kind`: `call` · `relay` · `pack` · `next` · `lean` · `wobble` · `light` · `break` · `echo` · `print`. Voz y texto van a `focus.wall`; los demás muros muestran eco tenue |
| `S.assistOn` | `''` o nombre de bloque | La colla está ayudando **ahora** (visible y nombrado). Nunca hay ayuda con `assistOn === ''` |
| `S.castell` | `{ state, walls[], structure, floors, floorsOwn, floorsColla, climbers, crown, slips, cracks }` | El castell persistente. `state`: `none` → `pinya` → `tronc` → `pom` → `crowned` → `down` \| `fallen`. `crown`: `''` \| `ample` \| `justa` |
| `S.result` | `{ brasa, pinya, tronc, pom, festa, baixada }` | Los dos finales por bloque (§4). Lo lee el acta |
| `S.ach` | `{ key, n, wall, s, y, by, at }` | El último logro. `by`: `group` \| `colla` |

### 2.2 Eventos nuevos (dueño: Interacción; consumen voz, texto y partes)

`ach:<key>` (carga en `S.ach`), `assist:on:<bloque>`, `assist:off`, `focus:<wall>`. Los eventos actuales no cambian.

| `ach:` | Cuándo | `n` | Consumidores |
|---|---|---|---|
| `fire` | primera mano de la Brasa en cada muro | muros encendidos 1–4 | voz (1.ª vez), brasa3d (hoguera que se queda) |
| `lap` | el relevo cumple su meta | saltos | voz, texto, brasa3d (frente que da la vuelta) |
| `wave` | llamada cumplida (dianas sostenidas a la vez; no hay «fallo») | olas 1–3 | voz, texto, brasa3d / festa3d |
| `awake` | fin de la Brasa | olas propias | voz según `by` |
| `wallfull` | un muro de la Pinya se llena | muros llenos | voz y texto en ese muro, pinya3d (las figuras se traban) |
| `close` | cierre | estructura 1–4 | voz (nombre de la estructura), texto, pinya3d |
| `floor` | piso nuevo | pisos 1–9 | voz, texto que sube, tronc3d |
| `level` / `lean` | cambio de estado de la plomada (no cada frase) | — | voz en el muro, tronc3d |
| `steady` / `slip` | temblor resuelto / piso perdido | pisos | voz, texto, tronc3d (el piso baja a la vista) |
| `tower` | fin del Tronc | pisos finales | voz, texto |
| `handoff` | relevo del Pom (el 1.º y cada 3.º) | relevos | voz (1.º), pom3d (salto de subida) |
| `arrived` | llega un escalador | 0–2 | voz, texto |
| `break` | el silencio se rompe de verdad | — | voz susurrada en ese muro, pom3d (resbalón) |
| `crown` | corona | `crown` ample/justa | voz, texto, tronc3d + festa3d |
| `echo` | eco devuelto | ecos | festa3d, texto |
| `bloom` | florecimiento | tamaño 1–3 | voz, festa3d |
| `down` | piso bajado | pisos restantes | texto, baixada3d + tronc3d |
| `clean` / `creak` | descenso limpio / con crujido | — | voz (1.ª vez) |

### 2.3 Tabla de apuntes `cues.js` (dueño: Narrativa)

`ressonancia/cues.js` y `ressonancia-sound/cues.js`, **copias idénticas** (una pieza sólo importa de su carpeta). Una entrada por
evento: `{ voice, where: 'room' | 'focus', energy, text, place: 'focus' | 'all' | 'structure', kind: 'task' | 'ach' | 'card', once, cooldown }`.
`sound.js` lee `voice/where`; `guide3d.js` lee `text/place/kind`. Es **la** fuente del guion de §3: si voz y texto discrepan, manda la tabla.

### 2.4 Lo que da `room3d.js` (dueño: VFX; lo consumen Modelado y las partes)

| API | Qué | Disponible |
|---|---|---|
| `room.setAir({ density, height, warm })` | Niebla radial + de altura con el color del fondo por dirección (`04 §2.2`). Activa por defecto en todos los materiales con `fog` | 01:30 |
| `room.setGrade(capítulo)` | Etalonaje por capítulo: exposición, tinte de sombras/luces, saturación, bloom. AgX en lugar de ACES | 01:30 |
| `room.contactShadows(max)` → `{ set(i, x, z, radio, k) }` | `InstancedMesh` de discos multiplicativos pegados al suelo | 02:00 |
| `room.matter.ceramic({ color, glaze, wear })` / `.body({ faixa })` | **La materia única** (D4): cerámica vidriada con rugosidad variable, rim frío fino, luz de la receta | 02:00 |
| `room.ground({ tile })` | Suelo a `y = 0` a escala real, anisotropía máxima, zonas mojadas | 02:30 |
| `room.keyShadow(target)` | Un foco con mapa de sombra 2048², actualizado **una vez por fotograma** | 04:00 (primer recorte) |
| `room.heat` (textura 1800×228 R8, `RepeatWrapping`) + `room.stamp(s, y, radio, k)` | Máscara persistente pintada por las manos (huella de 10–60 s, `01 §2.6`) | 03:00 |

Hasta que lleguen, Modelado trabaja con `MeshStandardNodeMaterial` + `room.lightRecipe()` + `room.rimNode()` (que ya existen,
`room3d.js:465-475`) y cambia a `room.matter` con una línea.

### 2.5 El kit de cuerpos (dueño: Modelado; lo consume VFX en la Brasa y la caída)

`scenes3d/bodykit.js` (nuevo): `createBodies({ THREE, TSL, room, max, poses })` → `{ mesh, set(i, { pos, yaw, pose, scale, tint }), count }`.
Mallas sólidas horneadas una vez con `bakeBody` (`parts/pinya3d/body.js:213`, que ya da `pos/nrm/idx`), 5 poses (de pie, palma al
frente, brazos trabados, cargando, brazo en alto), dos niveles de detalle, material `room.matter.body`, faja de color, disco de
sombra de contacto. **Un solo tratamiento del cuerpo para toda la obra.** Primera versión utilizable a las **02:00**.

### 2.6 El sistema de dianas `targets.js` (D3b) — dueño: Interacción; dibuja: Tech/QA; consumen: partitura, guía, sonido y partes

**Patrón único de toda la obra:** diana visible de ≥ 40 cm al alcance → se posa la mano ≈ 0,5 s (se carga, con anillo que se llena y
sonido inmediato) → se activa y se sostiene ≈ 0,5 s → se enciende la siguiente. Tocar libremente sigue teniendo respuesta, pero
**lo que hace avanzar la obra es posar y sostener**. Ninguna regla esencial mide golpes, tempo ni ventanas de aterrizaje.

Módulo puro (sin DOM ni GL), `ressonancia/targets.js` ≡ `ressonancia-sound/targets.js`. Lo crea y lo avanza `score.js`; su lista
viaja en `S.targets` con el estado (el sonido manda, la imagen copia: las dos ven las mismas dianas).

```js
const TG = createTargets({ lengths, heights, masks, seed });
TG.offer({ mode, goal, walls, y: [0.9, 1.4], r: 0.22, charge: 0.5, hold: 0.5, grace: 0.8, pairs: true, kind });   // la partitura, al entrar en cada etapa
TG.step(dt, strokes, n);            // cada paso; strokes = S.strokes, n = S.n
TG.list                             // → S.targets
//  { id, wall, dx, s, y, r, kind, state: 'idle' | 'charging' | 'active' | 'done',
//    charge 0..1, hold 0..1, chain, link (n.º en su cadena), pairOf, bornAt, doneAt }
TG.progress                         // 0..1 del objetivo de la etapa
// eventos (a S.events): 'tg:on:<id>' 'tg:charge:<id>' 'tg:active:<id>' 'tg:done:<id>' 'tg:link:<chain>' 'tg:goal'
```

| Regla | Valor |
|---|---|
| Tamaño y sitio | Ø ≥ 0,44 m (radio de captura = `r` + 0,10 m); centro entre 0,9 y 1,4 m (un niño llega siempre), salvo las etapas que suben o bajan a propósito, que ofrecen **siempre** además una variante por debajo de 1,4 m; a ≥ 0,5 m de una esquina y ≥ 0,8 m de otra diana; nunca dentro de una máscara del muro |
| Reparto | **Siempre en varios muros a la vez:** al menos una diana libre en cada muro, y una a ≤ 1,2 m de cada grupo de manos (manos a < 1,6 m entre sí = una persona). Nadie cruza la sala para encontrar la suya |
| Cantidad | Dianas vivas = `clamp(ceil(0,75 × S.n) + n.º de muros, 4, 16)`. Con 1–2 personas: las suyas y la siguiente de la cadena; con 15: muchas en los cuatro muros |
| Sin monopolio | Si una diana está ocupada y hay otra mano a < 2 m sin diana libre, nace una hermana a 0,8–1,2 m |
| Dos manos | Con `pairs`, las dianas cercanas a una persona nacen de dos en dos, a 0,6–1,2 m: **oferta, nunca requisito** (una basta para avanzar; dos avanzan algo más) |
| Carga | 0,5 s con cualquier mano dentro (no importa qué trazo). **Tolerante al sensor:** sin mano, la carga se conserva 0,8 s (`grace`) y luego baja en 3 s. Nunca hay que insistir ni repetir toques |
| Modos | `field` (N dianas a la vez; objetivo: una fracción) · `chain` (una cabeza por cadena; al activarla se enciende la siguiente a 0,8–2,5 m, también en el muro contiguo; cadenas = `clamp(ceil(S.n / 4), 1, 4)`, cada una nace junto a una persona) · `together` (llamada colectiva: `need` dianas **sostenidas a la vez** 0,5 s, con `need = clamp(round(0,35 × S.n / 1,6), 1, 6)`; sin ventana de tiempo) · `ladder` (cadena vertical: la siguiente nace más arriba o más abajo) |
| Tope visual | 16 dianas dibujadas; por encima, el sistema no crea más |

**Dibujo** (`scenes3d/targets3d.js`, Tech/QA): parte del anillo de vidrio que ya existe en `guide3d.js:150-170, 356-395` (se copia
como punto de partida y Narrativa retira el suyo). Reposo en el tono claro del capítulo; la carga lo llena de **oro de logro**; al
activarse, el anillo se rompe en teselas que van hacia la consecuencia (la llama, la figura, el piso). El acuse inmediato es el
sonido (nota de la escala del capítulo, §2.9); el anillo crece en 300–600 ms.

### 2.7 Paleta de la obra (D4b) — **propuesta que el director aprueba antes de la 01:15**; la implementa VFX en `scenes3d/palette.js`

Una sola familia: **cal, tierra cocida, tinta de noche y oro**. Cada capítulo toma 2–3 tonos y un acento. Las sombras nunca son
negro puro: son `tinta` u `ombra`. Sin turquesa, coral, violeta ni cian (hoy en `room3d.js:113-131`).

**Constantes de toda la obra**

| Token | Hex | Uso |
|---|---|---|
| `os` | `#EDE6D8` | Cal, porcelana, hueso: la luz de la obra, y la tinta del texto sobre fondo oscuro |
| `tinta` | `#0F1522` | La noche y la sombra fría (sustituye al negro) |
| `ombra` | `#3A2018` | La sombra cálida sobre cal y tierra |
| `or` | `#E8B04A` | **El logro, y sólo el logro**, igual en toda la obra: carga de las dianas, palabra de logro, corona, huellas. No es ambiente hasta la coronación |

**Por capítulo** (luma = luminancia media objetivo de la imagen ya tonemapeada, 0–1)

| Capítulo | Tonos | Acento | Relato | Luma |
|---|---|---|---|---|
| Espera | `tinta` · `pedra-nit #2A3140` · `os` | `or` al 40 % (el anillo) | La plaza dormida | 0,10 |
| Intro | `tinta` · `blau-plaça #24324C` · `cal-fanal #F0D9A8` | `fanal #EFA548` | Los faroles: primeras islas de cal iluminada | 0,10 → 0,18 |
| I · Brasa | `carbó #150D0B` · `brasa #C4401C` · `flama #F08A30` | `or` (la ola) | El único capítulo de fuego sobre oscuro | 0,15 |
| II · Pinya | `cal-foc #E6D6BC` · `terracota #B25A3C` · `ombra` | `faixa #A3302A` | La plaza encendida: cuerpos y cal a la luz de las hogueras | 0,35 |
| III · Tronc | `porcellana #F1ECE2` · `pedra-llum #D8C6A6` · `tinta-ombra #1C2436` | `or` (cada piso) | El castell a plena luz de plaza, con sombras azules y definidas | **0,45** |
| IV · Pom | `nit-alta #162038` · `blau-hora #3C4D7C` · `lluna #DCE3F0` | `or` (la luz que sube) | El silencio: la plaza se apaga para que se vea una luz | 0,12 |
| Coronación · V | `or-clar #F2D48A` · `crema #FFF2D8` · `bronze #5C3C14` | `os` (la corona) | La luz lo llena todo: bruma de oro con sombras de bronce | **0,60 → 0,50** |
| Bajada | `alba-rosa #F1C6B2` · `alba-blau #CFDFF0` · `albergínia #3B2B46` | `or` pálido | Amanece | 0,50 |
| Caída | `cendra #6F6860` · `brasa` · `tinta` | — | Ceniza y brasas | 0,20 |
| Acta | `cal #E9E2D4` · `tinta-text #1B1A18` · `ombra` | `or` (las huellas) | La pared de cal a la luz de la mañana, escrita | 0,45 |

**Interacción:** diana en reposo = el tono claro del capítulo; carga y activación = `or`; respuesta a la mano = el acento del
capítulo; palabra de logro = `or`. El texto es `os` en los capítulos oscuros y `tinta-text` en los claros (Pinya, Tronc, festa,
bajada, acta): Narrativa lo toma de `PAL[cap].ink`.
**Módulo:** `palette.js` exporta `PAL[capítulo] = { tones, accent, shadow, ink, luma }`, `ACH` y conversores a lineal;
`room.PALETTE` y `ENV_PRESETS` pasan a leerlo. Nadie escribe un hex fuera de ese archivo.

### 2.8 Curva de luz del pase (D5b)

```
luma 0,60 |                                        ██ coronación
     0,50 |                     ██ tronc           ████ festa ████ bajada ███ acta
     0,35 |             ██ pinya
     0,15 | espera ▁ intro ▂ brasa ▂                ▂ pom
          +----------------------------------------------------------------------→ tiempo
            noche → fuego → PLAZA ILUMINADA → noche alta (silencio) → ORO → AMANECER → MAÑANA
```

- En los capítulos claros la profundidad sale de **sombra oscura y definida sobre fondo claro** (arrojada + de contacto), no de
  figuras brillantes en el vacío. Por eso la sombra arrojada (V7) sube en la lista y deja de ser el primer recorte.
- El Pom es oscuro **a propósito**: es el silencio entre dos luces y hace que la coronación deslumbre sin quemar.
- **Seguro para proyector:** AgX; percentil 99 de luma ≤ 0,85; área por encima de 0,95 ≤ 1 %; la luma media no cambia más de ×2
  por segundo (decisión vigente del 24-11); ningún capítulo pasa de 0,60 de media. En una sala de 360° un muro muy claro lava el de
  enfrente: **hay que verlo en la sala**, y `exposure` queda como mando del operador.
- `shot.mjs` imprime de cada captura la luma media, el p99 y el % quemado: son criterio de aceptación de VFX y Modelado.

### 2.9 Un solo sonido (D6b) — dueño: Narrativa (es quien posee `sound.js`)

**Lo que dice el material de Vicente (se confirma analizando, no se da por bueno):** `m-tronc` y `m-festa` se pidieron a 100 BPM, en
re menor y re mayor, y están medidos a 100,00 BPM con el primer pulso en 0,045 s (`audio/music-prompts.json`, `sound.js:65`);
`m-crown` se pidió sobre un acorde de re mayor; lo generativo ya usa la pentatónica de re menor en los capítulos «de piedra» y la
de re mayor en el resto (`sound.js:101, 336-372`). **Sin dato:** `m-intro`, `m-brasa`, `st-pinya-*`, `m-pom`, `m-baixada`, `m-acta`,
y la afinación de `s-timbal`, `s-bells`, `s-gralla` y `s-tabals`.

| Regla | Cómo |
|---|---|
| Tabla `KEYS` por capítulo: `{ root, scale, bpm \| null, grid0 }` | Sale del **análisis** de cada stem (croma por FFT y autocorrelación de ataques, en `OfflineAudioContext`); si el análisis contradice el prompt, manda el análisis |
| Todo lo que tiene altura (nota de diana, campana, timbal, respuesta a la mano, efectos afinados) | Sólo grados de `KEYS[cap].scale`; los samples con altura se llevan a la tónica con `playbackRate` |
| Pulso | Con `bpm`: la nota cae en la corchea siguiente (retraso ≤ 150 ms; el clic de carga, sin altura, suena al instante). Sin `bpm` (intro, Pom, acta): sin pulso a propósito, ataques lentos |
| 15 manos = un acorde | ≤ 8 voces de mano a la vez; cada voz nueva toma el grado libre más lejano de los que suenan, en dos octavas; la más antigua cede con fundido |
| Sin altura (fuego, golpes, multitud) | Filtrados fuera de la banda de la voz (1–4 kHz) y por debajo de la música |
| Mezcla | La voz atenúa la música (ya lo hace, `sound.js:215`) **y** lo generativo; lo generativo vive en 0,8–5 kHz y deja el grave a los stems |
| La llamada no depende del timbal | El timbal acompaña la carga de las dianas y **la ola sale en el pulso siguiente**: cuantiza la música, no la persona |

---

## 3. Guion nuevo de voz y texto

**Voz:** Mía Evans (`Qvbf0AoA7UZSgJUp8Ba5`), `eleven_v4`, `stability 0.5`, `similarity_boost 0.8`, `mp3_44100_128`, `language_code: es`,
una frase por archivo en `ressonancia-sound/audio/es/`, comprobada con `scribe_v1` como hizo Vicente (que no se pronuncie la etiqueta).
**E** = existe (se reutiliza el archivo); **N** = hay que generarla (43 líneas, ≈ 1 350 caracteres, ≈ 1,5 MB).
**Dónde suena:** *sala* = `roomInput`; *muro* = `wallInput` de `S.focus.wall` al 100 % + 25 % a la sala (P2 y P3 comparten canal
en el mapa real: el muro que llama se apoya siempre en imagen y texto).
**Texto:** *consigna* centrada a **1,62 m**, mayúscula **0,18 m** (Geist; tamaño `0.27` en `lineItems`, hoy `0.15`, `guide3d.js:91`),
≤ 22 caracteres, al 100 % en `focus.wall` y al 30 % en los demás; *logro* a 0,35 m sobre la mano o el punto del logro, mayúscula
0,14 m, 2,5 s, entra enfocándose y **se rompe en teselas**; *cartela* con el nombre centrado a **1,95 m** (hoy 2,68). Sin etiquetas
mono, sin reglas, sin «P4», sin «1,25 m».
**Reglas de reproducción nuevas:** una línea de tarea corta a la anterior; una de logro espera su turno ≤ 1,5 s y si no, se queda
sólo en texto; los pisos y la colla pueden repetirse en un pase; el resto no.

### 3.0 Espera e intro

| Disparo | Línea | | Suena | Texto |
|---|---|---|---|---|
| manos fuera 6 s **o** sala vacía 40 s | «Tocad. Jugad con la sala.» `v-wait-invite` | E | sala | consigna en los 4 muros (única excepción al 30 %) |
| `reveal` | «Sostened el anillo para empezar.» `v-wait-start` | E | **muro** con más manos | consigna «Sostened el anillo» en ese muro; llega viajando desde donde se tocó por última vez |
| intro t = 2 | «Desde hace más de doscientos años…» `v-intro-1` | E | sala | — |
| t = 10 | «Un castell no lo construyen los que suben…» `v-intro-3` | E | sala | — |
| t = 21 | «Esta noche, estos muros son la plaza. Y vosotros sois la pinya.» `v-intro-4` | E | sala | — |
| t = 27,5 | «Fuerza. Equilibrio. Valor. Y seny.» `v-intro-5` | E | sala | el lema, un muro tras otro cada 1,6 s, a 1,9 m (ya existe, `introtext.js:46`) |
| t = 35–44 | — | | | título «Ressonància» a 1,95 m |

`v-intro-2` se retira (queda en disco). Intro = **45 s** (`TIMES.intro`, `score.js:32`). Requiere reajustar tres relojes: voz
(Narrativa, `sound.js:37-47`), texto (Narrativa, `introtext.js`), rotura de la plaza (VFX, `plaza.js`, hoy 46,3–57,8 s → 26–38 s).
**Si a las 02:00 no están los tres, la intro se queda en 70 s** (primer recorte de Narrativa).

### 3.1 I · Brasa

| Disparo | Línea | | Suena | Texto |
|---|---|---|---|---|
| `phase:title` | «Todo castell empieza en la oscuridad, con un solo gesto. Tocad el muro.» `v-brasa-1` | E | sala | cartela «I · Brasa · El despertar»; consigna «Tocad el muro» |
| `ach:fire` (1.ª) | «Ha prendido.» `v-brasa-fire` | N | muro | logro «Ha prendido» sobre la mano |
| `relay:start` | «Pasad el fuego. De mano en mano.» `v-brasa-pass` | N | muro del diable | consigna «Pasad el fuego» en ese muro; **viaja con el relevo** |
| `relay:assist` | «La colla os ayuda.» `v-colla-1` | N | muro | logro «La colla os ayuda» junto al diable |
| `ach:lap` | «El fuego ha dado la vuelta.» `v-brasa-lap` | N | sala | logro en los 4 muros, uno tras otro siguiendo el frente |
| 1.ª diana cargándose (`tg:charge`, una vez por pase) | «Dejad la mano sobre la luz.» `v-hold` | N | muro | — |
| 1.ª llamada (`together`) | «Ahora, todos a la vez.» `v-brasa-2` | E | sala, con el timbal en el muro con más manos | consigna «Todos a la vez» en los 4 muros (las dianas están en todos) |
| llamada abierta 8 s sin cumplirse | «Posad la mano en la luz. Todos.» `v-brasa-hold` | N | muro con más dianas libres | la consigna se refuerza en ese muro |
| `ach:wave` (1.ª) | «Eso es. La plaza despierta.» `v-brasa-wave` | N | sala | logro «Primera ola» / «Segunda ola» / «Tercera ola» |
| `ach:awake` `by: group` | «La plaza está despierta.» `v-brasa-awake` | N | sala | logro «Despierta» |
| `ach:awake` `by: colla` | «La colla os ayuda.» + «La plaza está despierta.» | E/N | sala | ídem |

### 3.2 II · Pinya

| Disparo | Línea | | Suena | Texto |
|---|---|---|---|---|
| `phase:title` | «Ahora, la fuerza. Palma con palma.» `v-pinya-task` | N | sala | cartela «II · Pinya · Fuerza»; consigna «Palma con palma» |
| etapa `pack` | «Juntaos. Hombro con hombro.» `v-pinya-closein` | E | muro con más manos | consigna «Juntaos» en ese muro |
| `ach:wallfull` | «Este lado aguanta.» `v-pinya-wall` | N | ese muro | logro «Aguanta» |
| `focus` `kind: next` (hay más muros por llenar) | «Ahora allí. Llevad la fuerza al otro muro.» `v-pinya-other` | N | **muro siguiente** | consigna «Ahora aquí» en el muro siguiente; flecha de teselas que viaja hacia él |
| `assist:on:pinya` | «No estáis solos. La colla empuja.» `v-colla-2` | N | muro | logro «La colla os ayuda» |
| `ach:close` | «El círculo se ha cerrado.» `v-pinya-3` | E | sala | — |
| +2,2 s, según `n` | «Es un pilar.» / «Es una torre.» / «Es un tres.» / «Es un quatre.» `v-struct-1…4` | N | sala | logro grande (0,22 m) «Pilar» / «Torre» / «Tres» / «Quatre» en los muros de la estructura |

### 3.3 III · Tronc

| Disparo | Línea | | Suena | Texto |
|---|---|---|---|---|
| `phase:title` | «Ahora, levantad. Cada piso sube con vuestras manos.» `v-tronc-lift` | E | sala | cartela «III · Tronc · Equilibrio»; consigna «Levantad» en los muros de la torre; en los demás «Empujad desde aquí» |
| `ach:floor` n = 2…9 | «Segundo piso.» «Tercer piso.» «Cuarto piso.» «Quinto piso. Ya es un castell.» «Sexto.» «Séptimo piso.» «Octavo.» «Noveno. No cabe más cielo.» `v-floor-2…9` | N | muro donde más se levantó | el nombre del piso (Segons, Terços…) **sube con la torre**: de 0,9 m a 2,0 m según el piso, mayúscula 0,14 m |
| `ach:lean` | «Mantened la torre recta. Sostened los dos lados.» `v-tronc-2` | E | muro que se inclina | consigna «Los dos lados» en ese muro |
| `ach:level` | «Recta. Así.» `v-tronc-level` | N | muro | logro «Recta» |
| `wobble` | «Tiembla. Sujetad la base.» `v-tronc-wobble` | E | **muro que tiembla** | consigna «Sujetad la base» a 1,0 m en ese muro |
| `ach:steady` | «La pinya aguanta.» `v-tronc-steady` | N | muro | logro «La pinya aguanta» |
| `ach:slip` | «Ha cedido un piso. Arriba otra vez.» `v-tronc-slip` | N | muro | el nombre del piso se rompe y cae |
| `assist:on:tronc` | «La colla os ayuda.» `v-colla-1` | N | sala | logro |
| `ach:tower` | «El tronc está en pie.» `v-tronc-done` | N | sala | logro «N pisos» |

### 3.4 IV · Pom de dalt y l'aleta

| Disparo | Línea | | Suena | Texto |
|---|---|---|---|---|
| `phase:title` | «Ahora, el valor. Los más pequeños suben los últimos. La plaza contiene el aliento.» `v-pom-1` | E | sala | cartela «IV · Pom de dalt · Valor» |
| t = 4 (antes 6) | «Quietos. Llevad su luz.» `v-pom-2` | E | muro de la luz | consigna «Quietos» en ese muro |
| `ach:handoff` (1.º) | «Pasa de mano en mano.» `v-pom-handoff` | N, susurro | muro que la recibe | logro «Dosos» que vuela con la luz |
| `ach:arrived` 0 | «Los dosos están arriba.» `v-pom-arrived-0` | N | sala | logro «Dosos» |
| `climber:1` | «Sube el acotxador. Contened el aliento.» `v-pom-breath` | N, susurro | sala | consigna «Contened el aliento» |
| `gust` / `ach:break` | «Shhh. Quietos.» `v-pom-hush` | N, casi inaudible | **muro de quien se movió** | — |
| `ach:arrived` 1 | «Ya está. Falta la más pequeña.» `v-pom-arrived-1` | N | sala | logro «Acotxador» |
| `climber:2` | «La enxaneta. Ni un gesto.» `v-pom-silence` | N, susurro | sala | sólo «Enxaneta», a 1,62 m |
| climb > 0,7 | «Quietos. Ya casi llega.» `v-pom-3` | E | sala | — |
| `phase:aleta` | «Ella levanta la mano.» `v-aleta-raise`, y a +0,6 s (antes +1,5) «Levantad la vuestra.» `v-aleta-yours` | E | sala | consigna «Levantad la mano» (hoy no hay texto) |

### 3.5 Coronación y V · La ressonància

| Disparo | Línea | | Suena | Texto |
|---|---|---|---|---|
| `ach:crown` | «¡Coronado!» `v-crown-shout` (eufórica, proyectada), y a +1,6 s «El castell está coronado.» `v-aleta-crowned` | N + E | sala | cartela «Coronado» a 1,95 m con el castell del grupo: «Tres de siete» |
| `block:festa` | «Ahora, la plaza es vuestra.» `v-aleta-2` | E | sala | cartela «La plaza es vuestra» |
| etapa `echo` | «Lanzad una onda al muro de enfrente.» `v-festa-echo` | N, alegre | sala | consigna «Lanzad una onda» |
| la 1.ª onda llega y enciende su diana | «Devolvedla.» `v-festa-return` | N | **muro de llegada** | consigna «Devolvedla» junto a la diana encendida, que espera 8 s |
| etapa `call` | «Y ahora, todos a la vez.» `v-festa-call` | N | sala | consigna «Todos a la vez» |
| `ach:bloom` | «Esto es la ressonància.» `v-festa-bloom` | N, plena | sala | logro grande «Ressonància» |

### 3.6 Bajada, caída y acta

| Disparo | Línea | | Suena | Texto |
|---|---|---|---|---|
| `block:baixada` | «Pero un castell solo está completo cuando baja. Seny. Acompañadlo, piso a piso.» `v-baixada-1` (estaba silenciada) | E | sala | consigna «Bajadlo despacio» en los muros de la torre |
| `ach:clean` (1.º) | «Bien. Otro más.» `v-baixada-ok` | N | muro | el nombre del piso **baja** con la torre |
| `ach:creak` | «Despacio. Piso a piso.» `v-baixada-gently` | E | muro | — |
| `warn:fall` | «No lo soltéis.» `v-baixada-warn` | N, urgente y bajo | sala | consigna «Manos al muro» |
| `fall` | «Ha caído. La pinya lo ha recogido.» `v-fall` | N | sala | cartela «Ha caído · Quedan las brasas» a 1,95 m |
| acta 4,5 s | `v-cierre-descarregat` / `-carregat` / `-intent` | E | sala | «Tres de siete» (mayúscula 0,46 m, centro bajado de 2,46 a **2,05 m**), el resultado y **una línea de relato**: «Levantado por N manos» y, si procede, «La colla ayudó en M pisos» (mayúscula ≥ 0,12 m; hoy 0,06) |
| acta 3 s | «Dejad vuestra mano en el muro.» `v-acta-print` | N | sala | «Dejad vuestra mano», mayúscula **0,18 m** a 1,45 m (hoy 0,08 a 1,18). Ventana 3–15 s → **3–22 s** |
| acta 24,5 s | «Este ha sido vuestro castell…» `v-cierre-final` | E | sala | frase final |
| `warn:abandon` | «Volved al muro. El castell os necesita.» `v-warn-return` | N | sala | consigna «Volved al muro» |

**Plan B de voz** (sin clave de ElevenLabs a la **01:15**, o la API falla): el guion entero sale en texto, y la voz usa sólo las
líneas E con el encaminado por muro. La obra sigue cumpliendo D7; D6 queda parcial y se le dice a Beltrán. La clave se lee de
archivo o variable de entorno, **no se imprime ni se commitea**; el director indica dónde está.
**Inglés:** las 43 líneas nuevas sólo existen en español. Con el selector en inglés suena el juego antiguo y las nuevas no se
cargan (lista `ES_ONLY`, para no llenar la consola de 404). Fuera de alcance esta noche.

---

## 4. Cambios de interacción

### 4.1 Auditoría de aforo de `score.js` (D8) — cada regla que depende de cuánta gente hay

| # | Regla hoy | Ancla | Falla con | Cambio |
|---|---|---|---|---|
| A1 | `people` = pico de manos / 1,6, que baja 0,05/s; `solo` = pico ≤ 2 | `:321-323` | grupo que mengua: los umbrales siguen altos 1–3 min | `S.n` suavizado (§2.1); `solo = S.n ≤ 2,2`; todos los umbrales de abajo usan `S.n` |
| A2 | `needWalls` 1/2/3/4 **congelado** antes de la Pinya | `:324-326`, `:422` | 8 personas que se quedan en 3: el círculo no cierra hasta el reloj | `needNow = clamp(muros con manos ahora, 1, needWalls)`, recalculado en cada paso |
| A3 | Relevo de la Brasa: **un** diable, sólo hacia +s, meta = 27,6 m | `:194-226` | 1–2 personas (hay que andar la sala entera) y 15 (catorce miran) | Meta = **una vuelta o `clamp(round(S.n), 3, 8)` saltos**, lo que llegue antes; acepta la mano más cercana **en los dos sentidos** (una mano puede repetir tras 2 s); corredores = `clamp(ceil(S.n / 8), 1, 3)` repartidos por el perímetro. En solitario el diable va y viene entre las dos manos de la persona en su muro |
| A4 | Llamada: aterrizar entre el primer tok y TOK + 0,7 s; `need = round(people × 0,4)` entre 2 y 5; sale de un muro al azar | `:135-142`, `:371-389`, `:659-671` | **todos** (D3b: golpe en ventana corta); grupo que mengua; solitario con la llamada en otro muro | **Se sustituye entera** por el modo `together` de las dianas (§2.6, §4.3): dianas en los cuatro muros, `need` sostenidas a la vez 0,5 s, sin ventana. `callCount` desaparece |
| A5 | Pinya: 80 % de las manos del muro en **2 m**, a ≤ 1,8 m del centro | `:407-409`, `TIMES.pinya` `:36` | 8+ personas en un muro (16 manos no caben en 2 m); grupo en una esquina (`pack = 0`) | Ventana `clamp(2 + 0,25 × (manos del muro − 4), 2, 4,5)` m; `nearFull` y `nearZero` = media anchura del muro y +0,5 m (la esquina cuenta: cada mitad llena su muro y `needNow` cierra) |
| A6 | Estructura = muros llenos **y sostenidos a la vez** | `:431-433` | 1–2 personas: siempre pilar | Estructura = muros **llenados** (aunque sea uno tras otro; `fill` decae 1/40 por s, `:417`), mínimo 1. Una persona sola que recorre dos muros hace una torre |
| A7 | Plomada: con manos en un solo lado, inclinación total | `:449-450` | una mano; un niño | Sólo se juzga con ≥ 2 manos en el muro y los dos lados presentes; si no, `target = 0`. La inclinación penaliza × 0,7 (hoy × 0,4, `:491`) |
| A8 | Temblor: muro **al azar** entre los de la torre; basta 1 mano baja | `:463`, `:508` | 1–2 personas en otro muro (7 m en 5 s); con 15, una mano lo salva sin que nadie lo vea | Muro = el de la torre con más manos; hacen falta `clamp(ceil(0,25 × manos del muro), 1, 4)` manos por debajo de `foot`; si ese muro se vacía, vale cualquier muro de la torre |
| A9 | Ganancia del piso = suma / **n.º de muros de la torre** | `:496` | grupo que mengua o solitario con torre de dos: la mitad de velocidad | Se divide por los muros de la torre **con manos** (mínimo 1); los vacíos se marcan «los sostiene la colla» |
| A10 | Relevo del Pom: salta cada 4 s; `gain = 1` siempre | `:566-567` | 15 personas: la luz visita a 9 de 30 manos; nadie nota que el relevo sirva | `every = clamp(16 / manos quietas, 1,5, 4)` s; ver B4 para la consecuencia |
| A11 | Aliento: **una** racha > 0,35 m para todo 1,5 s | `:571`, `:575` | 15 (uno arruina a catorce) | Racha sólo si la superan `max(1, ceil(0,2 × presentes))` manos |
| A12 | Silencio: sube sólo si **todas** quietas; cada rotura −6 % | `:577-581` | 15; quien llega tarde | Tolerancia `min(4, floor(0,15 × presentes))` manos en movimiento (0 hasta 6 manos, 1 de 7 a 13, 2 de 14 a 19…); una mano con menos de 1,5 s en el muro «está llegando» y no cuenta |
| A13 | L'aleta: 60 % de las manos alzadas en 2 s | `:619`, `TIMES.aleta` `:42` | 15 (siempre hay quien no levanta) | Quórum 0,6 hasta 4 manos, lineal hasta **0,4** con ≥ 12; `within` 2 → 3 s; ventana 10 → 12 s |
| A14 | Festa: la resonancia pide aterrizajes de ≥ 2 en 0,5 s | `:634` | una mano sola; y es una ventana de golpe (D3b) | La resonancia suma por **dianas sostenidas** (modo `field`) y por manos presentes; los aterrizajes sólo dan la onda libre, sin contar |
| A15 | Eco: devolver aterrizando a ± 0,7 s de la llegada; hasta 12 frentes | `:643-654` | todos (D3b); 8–15: ilegible | La onda sale al activar una diana y **enciende otra en el muro de llegada, que espera 8 s** a que alguien la sostenga; frentes activos ≤ `clamp(ceil(S.n / 5), 1, 4)`; con ≤ 2 personas la diana de llegada nace en el muro contiguo o en el propio; el tamaño del florecimiento divide los ecos por `clamp(S.n / 1,6, 2, 6)` (`:668`) |
| A16 | Bajada: soltar 1 s a media bajada = crujido y −2 pisos | `:699` | 1 mano que el sensor pierde | Usar `anyHeld` (el muro sigue «sostenido» 2 s, `linger`) en lugar de `!S.hands` |
| A17 | Espera: 3 s con dos manos, 4,5 con una; topes `downMax 3`, `holdMax 4` | `:341-348` | — | Sin cambios: ya escala y ya tiene tope |

**Sin dependencia de aforo (se dejan):** velocidad de pisos (`:503`), mediana del descenso (`:695`), huellas del acta (máx. 60, `:41`),
pista hablada cada 25 s (`:149`), abandono a 45 s (`:330`).

### 4.2 Consecuencia: dos finales por bloque, ayudas visibles, lo que persiste (D2, §7 #1)

**Regla general nueva:** ninguna red por reloj actúa en silencio. Cuando una red se activa: `S.assistOn = bloque`,
`assist:on:<bloque>`, voz y texto «La colla os ayuda», y las partes muestran a la colla (figuras de `bodykit` que entran). Lo
conseguido con ayuda cuenta como `by: 'colla'` y el acta lo dice.

| Bloque | Cambio de regla | Ancla | Final A (del grupo) | Final B (con la colla / menor) | Persiste |
|---|---|---|---|---|---|
| **B1 Brasa** | La chispa deja de ser 12 s fijos: pasa al relevo cuando hubo `min(4, muros con manos)` × `ach:fire` **o** a los 12 s. El relevo acelera: +0,3 m/s durante 2 s por salto. Olas: `ach:wave` (llamadas por dianas, §4.3). La red de `:393` (t = 68) se nombra | `:367-393`, `:200-201` | `result.brasa = 'encesa'`: 3 olas propias | `'ajudada'`: despierta la colla | Hogueras encendidas (1–4) siguen ardiendo, tenues, en Pinya y Tronc; temperatura del etalonaje |
| **B2 Pinya** | A2, A5, A6. La ayuda de `:402` (t = 40) se nombra y llega a 0,6 como hoy. `focus kind: next` señala el siguiente muro vacío cuando uno se llena | `:400-436` | Estructura por muros llenados; `result.pinya = { n, by: 'group' }` | Cierre por reloj: `by: 'colla'`, estructura = lo llenado (mínimo pilar) | `S.castell.walls`, `structure`; las figuras trabadas se quedan al pie de la torre |
| **B3 Tronc** | A7–A9. **La ayuda sólo lleva hasta 5 pisos** (el mínimo de un castell): `assist` de `:497-503` vale 0 con `floors ≥ 5`. Fin: 9 pisos y t ≥ min; o t ≥ target con ≥ 5; o max. Se elimina «≥ 7 a los 115 s». `floorsOwn` / `floorsColla` | `:497-516` | 6–9 pisos propios | 5 pisos, de ellos M de la colla | `S.castell.floors` es **la altura de la torre** en Pom, coronación, bajada y acta |
| **B4 Pom** | Relevo: velocidad base 0,55 (≈ 70 s sin relevos) y **cada relevo da +7 % de golpe, a la vista**; con relevos cada 4 s llega en ≈ 22 s; en solitario cuentan los relevos entre las dos manos; con una sola mano, base 0,8. Silencio: rotura real = −8 %, resbalón visible, `ach:break`, máximo 3 por subida. La deriva de `:592` se nombra | `:566-567`, `:580`, `:592` | `result.pom = 'net'` (≤ 1 resbalón) | `'patit'` (sufrido): se cuenta en el acta | `S.castell.slips`, `climbers` |
| **B5 L'aleta** | A13. Voz que termina en 3,5 s. Texto «Levantad la mano» | `:608-623`; `sound.js:793` | `crown = 'ample'` (≥ 60 % alzó) | `'justa'` (por ventana) | Anchura de la corona; el acta dice «coronado por todos» o «coronado» |
| **B6 Ressonància** | A14, A15. `focus kind: echo` en el muro de llegada. `ach:bloom` con tamaño 1–3 | `:634-675` | Florecimiento 3: «resonancia plena» | 1–2 | `result.festa` |
| **B7 Bajada** | A16. La banda se dibuja a la altura mediana de las manos presentes (`S.band`, ya existe `:696`): un niño la coge. La red de `:704` se nombra | `:687-705` | `'net'`: sin crujidos | `'cruixit'`; o cae = *carregat* | Valor *seny* del acta |
| **B8 Acta** | `acta()` añade `floorsOwn`, `floorsColla`, `crown`, `slips`, `result` | `:726-729` | — | — | — |

### 4.3 Rediseño por dianas (D3b) — manda sobre §4.1 y §4.2 donde se contradigan

Qué mide hoy cada bloque y por qué cambia. «Tiempo» = depende de golpe, tempo o ventana corta.

| Bloque / etapa | Hoy | Tipo | Con dianas (`TG.offer`) | Objetivo y aforo |
|---|---|---|---|---|
| Espera: anillo | sostener el centro del muro 3–4,5 s | sostener ✔ | Pasa a ser una diana del sistema, una por muro (y pareja junto a quien esté) | sin cambio |
| Intro | aterrizaje enciende farol | golpe, no esencial | `field`: sostener 0,5 s bajo un farol lo enciende y **se queda** | no bloquea nada |
| Brasa · chispa | aterrizajes sueltos, 12 s | golpe | `field`: brasas-diana; sostener = prende (`ach:fire`) | pasa al relevo con `min(4, muros con manos)` fuegos, o a los 12 s |
| Brasa · relevo | el diable busca la mano de delante | presencia ✔ | `chain`: el diable descansa en la diana activa; la siguiente se enciende a 0,8–2,5 m; quien la sostiene lo recibe. Varias cadenas con grupo | meta: `clamp(4 + round(S.n / 2), 5, 12)` eslabones entre todas las cadenas, o una vuelta. Solo: la cadena viaja a paso de persona, y con las dos manos avanza de pareja en pareja |
| Brasa · llamada ×3 | aterrizar en el TOK | **tiempo** | `together` ×3: `need` crece 35 % → 50 % → 65 % del grupo (mínimo 1, tope 6). El timbal acompaña la carga; la ola sale en el pulso siguiente | sin fallo: a los 14 s abierta, la colla completa (nombrado) |
| Pinya · palma | aterrizaje → sale una figura | golpe | La **palma de la figura es la diana**: sostener 0,5 s y la figura carga su peso en ti | una figura por mano hasta 16 |
| Pinya · juntarse | manos agrupadas y sostenidas | sostener ✔ | Las dianas-palma se van acercando hombro con hombro hacia el punto de reunión; la regla de `pack` (A5) no cambia | A2, A5, A6 |
| Tronc · levantar | subir ≥ 0,33 m dentro de una frase de 4,8 s | **tiempo** (frase) | `ladder`: diana baja (0,9 m) → al activarla nace la siguiente 0,35 m más arriba (hasta 1,6 m; variante infantil 0,7 → 1,05 → 1,4) → al completar la escalera, el piso sube. La frase musical sigue sonando, pero **no juzga** | por piso: `clamp(ceil(0,5 × S.n / 1,6), 1, 6)` escaleras completas; como mucho un piso cada 6 s (15 personas no lo aceleran); a los 16 s sin piso y con menos de 5, la colla (nombrado) |
| Tronc · plomada | diferencia de alturas entre lados | sostener ✔ | Las escaleras nacen **a los dos lados** de la torre; la torre se inclina hacia el lado que va por delante en escaleras completas | A7: sólo con ≥ 2 manos en el muro |
| Tronc · temblor | una mano baja 1 s en 5 s | sostener, plazo corto | `field` de dianas al pie (0,6–0,9 m) en **todos** los muros de la torre; plazo 5 → 7 s | A8 |
| Pom · relevo | cualquier mano quieta | sostener ✔ | La luz descansa en una diana sostenida; las siguientes se encienden en otros muros; una mano quieta en una diana encendida la recibe | A10, B4 |
| Pom · aliento / silencio | quietud de todos | sostener ✔ | Sin dianas nuevas: las manos se quedan donde están | A11, A12 |
| L'aleta | subir 0,28 m o pasar de 1,6 m en 2 s | gesto con ventana | Una diana **0,35 m por encima de cada mano presente** (tope 1,9 m) y una por muro a 1,5 m; sostener 0,5 s | A13 |
| Festa · libre | aterrizajes juntos en 0,5 s | **tiempo** | `field` denso; cada diana sostenida abre un anillo grande y suma resonancia | A14 |
| Festa · eco | devolver a ± 0,7 s | **tiempo** | `chain` entre muros (A15) | A15 |
| Festa · llamada ×4 | aterrizar en el TOK | **tiempo** | `together` ×4, cada una mayor | como la Brasa |
| Bajada | descender ≥ 0,35 m; cruje si va a más de 0,4 m/s | velocidad | `ladder` hacia abajo (1,5 → 1,2 → 0,9 → 0,6 m). El ritmo lo pone la carga (≈ 1 s por eslabón): **se elimina el crujido por velocidad** (`:692`); cruje sólo si se suelta a media escalera (A16) | por escalera completa bajan 2 pisos; mediana del grupo |
| Acta | mano quieta 0,5 s | sostener ✔ | Diana de huella junto a cada mano | sin cambio |

Consecuencia para el código: `callCount` (`:135-142`), el reloj de frase como juez (`:469-486`), el juicio del eco por ventana
(`:643`) y el crujido por velocidad (`:692`) **desaparecen**; `relayStep` (`:190-227`) se reduce a seguir la cadena. La partitura
queda más corta. Los parámetros de `tuning.js` que mueren (`brasa.early/late`, `festa.early/late/window`, `hand.moved/recent`,
`tronc.rise`, `baixada.gentle`, `brasa.relayReach…`) liberan sitio en el manifiesto para los cuatro de las dianas (`tg.charge`,
`tg.hold`, `tg.grace`, `tg.r`): el Tech/QA cuadra el total en ≤ 64.

**Arreglos de borde (§7 #15):** con dianas, la herencia de trazo deja de hacer falta casi siempre (la carga pertenece a la diana,
no al trazo). Queda para la quietud del Pom: un trazo nuevo que aparece a < 0,4 m de uno perdido hace < 1 s **hereda** sus
segundos de quietud (`tr.still`, `:130`), para que una mano que el sensor parte no «llegue de nuevo».

**Sincronía obligatoria:** `ressonancia/score.js` ≡ `ressonancia-sound/score.js` y lo mismo `tuning.js`, `targets.js` y `cues.js`. Se edita la
de `ressonancia/` y se copia; **cada commit que toque una lleva la otra** y pasa `cmp`. Los valores nuevos de `TIMES` que tengan
parámetro en `tuning.js` actualizan su `DEF` y el valor por defecto del manifiesto (pedírselo al Tech/QA; el manifiesto tiene
**65 parámetros**, el contrato admite 64: no se añade ninguno, y el Tech/QA quita uno).

---

## 5. Paquetes de trabajo

### 5.0 Reglas del árbol compartido

- `git add <rutas explícitas>` + `git commit` **en la misma orden**; nunca `git add -A`, `git stash`, `checkout`, `reset` ni `rebase`.
  Si existe `.git/index.lock`, esperar 5 s y reintentar. Mensajes `Studio: <qué>`. Commits pequeños, cada 20–40 min.
- Nadie edita un archivo ajeno. Si hace falta, se pide al director con: archivo, línea, qué y por qué.
- Antes de cada commit: `node lab/tools/check-syntax.mjs` (sin GPU).

### 5.1 Cerrojo de GPU

Archivo `.gpu-lock` en la raíz del árbol `lab-vicente` (en `.git/info/exclude`). Una línea: `<agente> <hora ISO> <qué> <segundos previstos>`.

1. Tomarlo: `set -o noclobber; echo "vfx $(date -Is) brasa-shot 60" > .gpu-lock` (falla si existe).
2. Si existe: esperar y reintentar cada 20 s. Si tiene **más de 4 min**, está huérfano: avisar al director y tomarlo.
3. Un render por toma, **escala 0,5**, ≤ 90 s; como mucho 3 capturas seguidas y soltar (`rm .gpu-lock`). Soltar siempre, también si falla.
4. `?scale=1` sólo el Tech/QA y sólo en las ventanas autorizadas: **03:30–03:45** y **05:40–06:00** (el director avisa al equipo de Unreal).
5. El Tech/QA publica antes de la **01:00** `lab/tools/shot.mjs <agente> <url> [--shot …]`, que toma el cerrojo, llama a `check.mjs` y lo suelta. Desde entonces se usa sólo eso.
6. Lo que no dibuja no necesita cerrojo: la simulación de la partitura en Node, la sintaxis, la generación de voz.

### 5.2 Propiedad de archivos (un dueño por archivo)

| Agente | Archivos |
|---|---|
| **Tech/QA** (en marcha) | `res-obra3d/*`; `res-3d-study/{experience.js,index.html,manifest.json}`; `ressonancia/experience.js`; `ressonancia/scenes3d/emit.js`; `ressonancia/scenes3d/PARTS.md`; **`scenes3d/targets3d.js` (nuevo: el dibujo de las dianas)**; `lab/tools/*`; `lab/harness/*`; `lab/estudio/album*` |
| **Narrativa y voz** | `ressonancia-sound/{sound.js,manifest.json,NOTES.md}`; `ressonancia-sound/audio/**`; `ressonancia/cues.js` + `ressonancia-sound/cues.js`; `scenes3d/{guide3d.js,typo3d.js}`; `scenes3d/parts/{introtext.js,actatext.js}` y sus `.json` en `res-3d-study/parts/`; `lab/estudio/tools/gen-voice.mjs` |
| **Interacción y partitura** | `ressonancia/{score.js,tuning.js}` y **`ressonancia/targets.js` (nuevo)** + las copias de los tres en `ressonancia-sound/`; `lab/estudio/tools/score-sim.mjs`; `GUION.md` |
| **VFX y luz** | `scenes3d/room3d.js`; **`scenes3d/palette.js` (nuevo)**; `scenes3d/parts/{atmos.js,plaza.js,brasa3d.js,festa3d.js,baixada3d.js,fall3d.js,umbral3d.js}` + `parts/umbral3d/`; parte nueva `parts/porxada.js`; sus `.json` |
| **Modelado 3D y personajes** | `scenes3d/bodykit.js` (nuevo); `scenes3d/parts/{pinya3d.js,tronc3d.js,pom3d.js,castell.js}`; `parts/pinya3d/*`, `parts/tronc3d/*`; sus `.json`; `scenes3d/assets/models/**` si entra algún GLB |

Peticiones previstas al Tech/QA (dueño del anfitrión): registrar `porxada`; **añadir `plaza` (iluminada) a los juegos de `pinya` y
`tronc`** (D5b); mantener `tronc3d` en `crown`/`festa` (y en `pom` si
Modelado lo pide) en `wanted()` (`res-obra3d/experience.js:170-188`); pasar `S.castell` y `S.focus` tal cual en `input.state` (ya
viajan con el estado); remapear el reloj de la intro; quitar un parámetro del manifiesto; G con 15 manos.

### 5.3 Tech/QA lead (ya en marcha; aquí sólo lo que este plan le añade)

1. **00:45** commit de la guardia del visor (11 archivos). 2. **01:00** `shot.mjs` + arnés con 16 manos virtuales (`?group=15`, G 1·2·4·8·15).
3. **01:30** álbum «antes» (una captura por bloque, escala 0,5) en `lab/estudio/album4/`. 4. Manifiesto ≤ 64 y descripción al día.
5. Peticiones de §5.2 según lleguen (≤ 15 min cada una). 6. **`targets3d.js`** (§2.6): dibuja `S.targets` (≤ 16) con los tokens de
`palette.js`; primera versión a las **02:30** (anillo, carga, activación), rotura en teselas hacia la consecuencia a las 04:00.
7. `shot.mjs` imprime luma media, p99 y % quemado de cada captura (§2.8). 8. Ventanas de escala 1 y plan B (calidad media).
9. Álbum «después» a las 05:30 y protocolo de §6. 10. Arranque: sonar antes de terminar de compilar (D9), **si queda tiempo**: con
`targets3d.js` encima, es lo primero que este puesto recorta, y hay que decírselo a Beltrán.

### 5.4 Narrativa y voz

| # | Tarea | Aceptación |
|---|---|---|
| N1 | `cues.js` (dos copias) con todo §3; borrador a las **01:00** para que Interacción confirme las claves | `cmp` limpio; cada `ach:` de §2.2 tiene entrada o un «sin apunte» explícito |
| N2 | `gen-voice.mjs`: genera las 43 líneas N, guarda `request-id`, duración y transcripción `scribe_v1`; actualiza `voice-lines-es.json` | 43 mp3 en `audio/es/`, cada uno < 20 MB (son ≈ 30 KB); la transcripción coincide; ninguna etiqueta pronunciada; la clave no aparece en ningún archivo ni en la salida |
| N3 | `sound.js`: `say(name, { wall })` → `wallInput` del muro al 100 % + 25 % a la sala; atenuación de música igual que hoy (`:205-216`); cola de logros (espera ≤ 1,5 s); lista de repetibles; `ES_ONLY` | En `/sound/ressonancia-sound` los medidores muestran el muro correcto en «Sujetad la base» y «Devolvedla»; sin clics; pico de voz como las líneas actuales |
| N4 | `sound.js`: `onEvent` consume `ach:*`, `assist:on:*`, `focus:*` a través de `cues.js`; reloj nuevo de la intro; `v-baixada-1` reactivada; l'aleta a +0,6 s | Un pase a ritmo ×8 (`pace`) dice cada línea de §3 una vez y en su momento |
| N5 | `guide3d.js`: **retira sus anillos** (los dibuja `targets3d.js`); tinta de `PAL[cap].ink` (oscura en los capítulos claros); consigna a 1,62 m y 0,18 m; cartela a 1,95 m; **se quita la capa fina** (`fineItems`, `:330-346`: «P4», «1,25 m», reglas); etiquetas mono fuera | Captura con B: consigna entre 1,4 y 1,8 m; ningún metadato; ninguna consigna de más de 22 caracteres |
| N6 | `guide3d.js`: texto por `S.focus` (100 % en el muro que llama, 30 % en los demás, entra primero allí) y capa de **logro** (palabra sobre el punto, 2,5 s, rotura en teselas) | Con `focus.wall = 2`, el texto aparece primero y más fuerte en P2 |
| N7 | Animación con sentido: la consigna viaja con el relevo de la Brasa; el nombre del piso sube y baja con la torre | Capturas en dos instantes del relevo y con 3 y 7 pisos |
| N8 | `actatext.js`: tamaños y alturas de §3.6, línea de relato, ventana de huellas 3–22 s | «Dejad vuestra mano» ≥ 0,18 m a 1,45 m; el acta distingue «con la colla» |
| N9 | `introtext.js`: reloj de 45 s | El lema coincide con la voz ± 0,3 s |

**Subpaquete de sonido (D6b, §2.9) — mismo agente, porque es el dueño de `sound.js`:**

| # | Tarea | Aceptación |
|---|---|---|
| S1 | Analizar cada stem y sample con altura (tónica, modo, BPM, primer pulso) con un script en `OfflineAudioContext`; escribir la tabla `KEYS` en `sound.js` y el resultado en `ressonancia-sound/NOTES.md` | Tabla completa para los 9 capítulos, con el dato del análisis junto al del prompt; las discrepancias, señaladas al director |
| S2 | Todo lo generativo con altura pasa por `KEYS`: nota de diana (`tg:charge` = clic sin altura al instante; `tg:active` = nota en la corchea siguiente), campanas, timbal afinado a la tónica, impactos (`sound.js:336-449`) | Ninguna nota fuera de la escala del capítulo |
| S3 | Asignación de voces: ≤ 8 voces de mano, grado libre más lejano, dos octavas; sin altura fuera de 1–4 kHz; la voz atenúa también lo generativo | Con 15 manos virtuales: pico antes del limitador ≤ −3 dBFS y sin saturar |
| S4 | **Prueba de mezcla:** 60 s por capítulo con 1 y con 15 manos virtuales, grabados desde `/sound/ressonancia-sound` (`MediaStreamDestination`, sin GPU) y analizados: ≥ 85 % de la energía con altura en las clases de nota de la escala; ataques a ≤ 40 ms de la rejilla en los capítulos con pulso; voz ≥ 6 dB sobre el resto en 1–4 kHz mientras habla | 18 mezclas con su informe en `lab/estudio/notas/`. **Ningún agente puede oír:** los wav quedan para que el director y Beltrán los escuchen; la prueba numérica no sustituye a esa escucha |

**Depende de:** eventos, `S.focus` y `S.targets` de Interacción (borrador 01:15, firme 02:00). Mientras, se prueba con eventos inyectados a mano.
**Hitos:** 02:00 N1, N3, N5 y S1 hechos, N2 lanzada · 04:00 N2, N4, N6, N8, S2, S3 · 05:30 S4, N7 y repaso de un pase entero.
**Este puesto es el más cargado del plan** (voz, texto, guion y ahora la coherencia musical). Si a las 02:00 va tarde, el director
le quita N7–N9 enteras antes de tocar S1–S4 o N2–N6.
**Recortar primero:** N9 (intro a 70 s) → N7 → N8 se queda en tamaños y alturas (el acta sigue oscura, sin el mundo de cal) → las ocho líneas de piso se quedan en 2, 5, 7 y 9 → voz por muro sólo en temblor y eco.
**No se recorta:** S1 y S2 (D6b), N3, N5.

### 5.5 Interacción y partitura

| # | Tarea | Aceptación |
|---|---|---|
| I0 | **`targets.js`** (§2.6), dos copias, con su prueba en Node: reparto por muros, cantidad por `S.n`, sin monopolio, parejas, carga con gracia, los cuatro modos | **Entrega 01:30** (API firme a la 01:00 para que el Tech/QA empiece el dibujo). Con 1, 2, 4, 8 y 15 manos: siempre ≥ 1 diana libre por muro y una a ≤ 1,2 m de cada persona; nunca más de 16; una mano que el sensor pierde 0,6 s no pierde la carga |
| I1 | `score-sim.mjs`: simulador en Node (sin GPU) con públicos sintéticos de 1, 2, 4, 8 y 15 manos en tres conductas (posa y sostiene, pasiva, caótica **que sólo da golpes**) y con pérdida de trazos tipo LiDAR (6 %); imprime duración por bloque, resultado, ayudas y eventos | Corre en < 20 s; línea base de 7a056a2 guardada **antes** de cambiar nada |
| I2 | §2.1 y §2.2: `S.n`, `S.focus`, `S.assistOn`, `S.castell`, `S.result`, `S.ach` y sus eventos, sin cambiar reglas todavía | El simulador muestra los eventos; el anfitrión y el sonido siguen funcionando (campos nuevos, nada quitado). **Entrega 01:15** |
| I3 | Auditoría de aforo A1–A16 | Matriz de §6.1 en verde |
| I4 | Consecuencias B1–B8 y ayudas nombradas | Con conducta pasiva: `assistOn` se activa en cada bloque y `floors = 5`; con ideal: nunca se activa y `floors ≥ 8` |
| I5 | **§4.3: cada etapa pasa a dianas** (llamada, levantar, eco, bajada, l'aleta, chispa, palma); mueren `callCount`, el juicio por frase, la ventana del eco y el crujido por velocidad | La conducta «sólo golpes» no hace avanzar ningún bloque (y la colla, nombrada, lo termina); «posa y sostiene» consigue el final A de todos |
| I6 | §7 #10: el relevo de la Brasa como cadena en los dos sentidos (A3); eco por diana que espera (A15) | Una mano sola completa el relevo en ≤ 30 s sin ayuda y devuelve un eco sin moverse de su muro |
| I7 | §7 #11: el relevo del Pom acelera y el silencio falla a la vista (B4) | Con relevos, la primera subida dura ≤ 25 s; sin relevos, ≥ 60 s |
| I8 | `tuning.js` al día (dos copias), `GUION.md`, `acta()` | `cmp` limpio en las cuatro parejas |

**Depende de:** nada para empezar. **Hitos:** 01:30 I0 · 02:00 I1, I2, Brasa entera sobre dianas · 04:00 I3–I7 completas, matriz en verde · 05:30 sólo afinado con lo que
digan las capturas y el pase a ritmo ×8; **congelación de reglas a las 05:00**.
**Recortar primero:** cadenas múltiples (queda una) → dianas en la intro → la escalera de la bajada (se queda la regla actual de descenso, sin crujido por velocidad) → la herencia de quietud.
**No se recorta:** I0; la llamada, el eco y el levantar sobre dianas (son la D3b); A2, A5–A9, A11–A13 (son la D8); las ayudas nombradas (son la D2).

### 5.6 VFX y luz

Aspecto global, por orden de valor por hora (costes de GPU de `04 §6` y `01 §2`, sin medir):

| # | Qué | Horas | GPU | Riesgo |
|---|---|---|---|---|
| V0 | **`palette.js`** con los tokens de §2.7 **una vez aprobados por el director** (01:15); `room.PALETTE` y `ENV_PRESETS` (`room3d.js:113-131, 390`) leen de ahí; fondos claros en Pinya, Tronc, coronación, bajada y acta | 0,5 | 0 | bajo |
| V1 | **Aire:** `room.setAir` — niebla radial + de altura con el color del fondo por dirección y lóbulo hacia la luz (nunca `rangeFogFactor`: salta en las esquinas) | 1–1,5 | ≈ 0 | bajo |
| V2 | **Cadena de estudio y curva de luz (§2.8):** AgX en vez de ACES, `room.setGrade` por capítulo con su **luma objetivo** y exposición calibrada para proyector (p99 ≤ 0,85, quemado ≤ 1 %), bloom sólo sobre emisivos reales, tramado más fuerte en negros, y **oscurecimiento vertical continuo** (arriba y abajo, igual en los cuatro muros: no una viñeta por muro, que enmarcaría las esquinas, `room3d.js:354-356`) | 1 | ≈ 0 | bajo; revisar que ninguna parte dependa del quemado de ACES |
| V3 | **Materia única:** `room.matter.ceramic/body` y `room.contactShadows` | 1 | ≈ 0 | bajo |
| V4 | **Suelo que continúa:** `room.ground` a escala real en intro, Brasa, Pinya, Tronc y bajada | 1 | ≈ 0 | bajo |
| V5 | **Capa 0, la *porxada*:** columnas ≤ 45 cm en las cuatro esquinas y dinteles, casi en negro, vanos ≥ 2,5 m; presente en intro, Brasa, Pinya, Tronc, bajada | 1,5 | ≈ 0 | bajo; no tapar la franja 0,6–2,0 m |
| V6 | **Huella persistente:** `room.heat` + `room.stamp` (cada mano sella 25 cm; decae en 60 s) | 0,75 | 0,1 ms | bajo |
| V7 | **Sombra arrojada (D5b: es lo que da profundidad a los mundos claros):** `room.keyShadow` — un foco con mapa 2048², PCF suave, `autoUpdate = false` + una actualización por fotograma; sombra del color `tinta-ombra` / `ombra`, no negra. Sobre la multitud de la Pinya y la torre del Tronc | 2 | 0,3–1 ms | medio |
| V8 | **La plaza iluminada:** modo `lit` de `plaza.js` para Pinya y Tronc — fachadas de cal (`cal-foc`, `pedra-llum`) con luz rasante, porches en sombra, cielo `tinta` arriba; niebla luminosa cálida | 1,5 | ≈ 0 | medio (sin leer `plaza.js` a fondo) |

Por bloque:

| Bloque | Cambio | Coste |
|---|---|---|
| **Brasa** `brasa3d.js` | (a) **El fuego prende bajo la mano**: llama de 1–1,4 m en el plano del muro (0,3–1 m detrás), que crece en 300–600 ms (el acuse inmediato es el sonido) y deja brasa en `room.heat` durante 60 s. (b) Diables = cuerpos de `bodykit` de 1,5 m aparentes a 2–3 m del muro, a contraluz con rim cálido; adiós a los palitos. (c) Humo y resplandor que llenan hasta 3,75 m con `setAir`. (d) La ola es un **frente visible** que da la vuelta a 2–3 m/s. (e) Hogueras que quedan por `ach:fire`. (f) Chispas a la mitad | 2 h |
| **Coronación / festa** `festa3d.js` | **Mundo claro:** bruma luminosa `crema` / `or-clar` que llena el muro, con el castell (de `tronc3d`, que el anfitrión mantiene) en `bronze` a contraluz y su sombra larga en el suelo; después el oro lo envuelve. Luma 0,60 sin quemar. Arena a un tercio. El anillo propio de cada mano con borde oscuro para que se lea sobre el oro. Eco: un frente con cresta y retroceso (`01 §2.9`) | 1,5 h |
| **Bajada** `baixada3d.js` | Cielo de alba claro (`alba-rosa` → `alba-blau`) que ocupa el muro; tres capas de silueta `albergínia` con bruma luminosa entre ellas (no cartulina negra); banda a la altura de `S.band`; las esquirlas dejan de ser confeti (se reducen a polvo de vidrio a la luz) | 1 h |
| **Intro** `plaza.js`, `atmos.js` | Niebla y suelo; el farol que enciende la mano es **el del porche que tiene encima** (charco de luz ≥ 1 m que se queda); reloj de la rotura para la intro de 45 s | 1 h |
| **Caída** `fall3d.js` | Polvo con luz, etalonaje, cuerpos que la pinya recoge (de `bodykit`) | 0,5 h, si queda |
| **Espera** `umbral3d.js` | Sólo quitar el borde de neón del arco y bajar especulares | 0,25 h, si queda |

**Orden:** V0 → V1 → V2 → V3 (los cuatro a la **01:45**; desbloquean a Modelado, al Tech/QA y a Narrativa) → V4 → V7 → V8 → Brasa (a, b, c) → festa → bajada → V6 → V5 → Brasa (d, e) → intro.
**Aceptación:** capturas a escala 0,5 de cada bloque donde (1) lo lejano pierde contraste, (2) nada flota (sombra de contacto bajo
toda figura), (3) la mitad alta del muro no es negro liso, (4) la luma media de cada capítulo a ± 0,07 de §2.7, p99 ≤ 0,85 y
quemado ≤ 1 % (lo imprime `shot.mjs`), (4b) ningún color fuera de `palette.js`, (5) costura P3→P4 sin
corte de halo ni de niebla, (6) sin franja visible en las esquinas.
**Hitos:** 02:00 V0–V3 entregados y commiteados, V4 en marcha · 04:00 V7, V8, Brasa (a–c), festa · 05:30 bajada, V6, V5, capturas de todos los bloques con su luma.
**Recortar primero:** caída y espera → Brasa (d, e) → reloj de la intro → V6 (huella) → V5 sólo columnas de esquina, sin dinteles → V7 sólo sobre la torre.
**No se recorta:** V0–V3, V8 y la coronación clara (son la D4b y la D5b).

### 5.7 Modelado 3D y personajes

| # | Tarea | Aceptación |
|---|---|---|
| M1 | `bodykit.js` (§2.5): cuerpos sólidos horneados, 5 poses, 2 niveles de detalle, faja, sombra de contacto | A la **02:00**: una fila de 12 cuerpos en la página de estudio, iluminados, con sombra; se leen como personas a 3 m de la pantalla |
| M2 | **Pinya** `pinya3d.js` (**mundo claro**: cuerpos `terracota` y `cal-foc` con sombra `ombra` sobre la plaza iluminada, no figuras brillantes sobre negro): la multitud deja de ser 733 000 puntos (`:61`, `:346`) y pasa a instancias sólidas (≤ 160 visibles, las lejanas en bajo detalle y fundidas en la niebla); **la figura que viene a tu palma está a 0,6–1,2 m tras el muro** (≈ 1,3 m de alto aparente), **su palma es la diana** (`S.targets`, `kind: palm`): se ofrece en < 250 ms desde que llega la mano, y al sostenerla 0,5 s la figura carga su peso y se queda; con `ach:wallfull` las figuras se traban hombro con hombro y se quedan | Captura con 1 mano: una persona de cerámica de ≥ 1 m bajo la mano. Con 15 manos: 15 figuras, sin saturar (tope 16; por encima, la multitud responde como grupo) |
| M3 | **Tronc** `tronc3d.js` (**el capítulo más claro**: `porcellana` sobre `pedra-llum`, sombras `tinta-ombra` definidas): los cuerpos de la torre con `room.matter.body` (vidriado variable, fajas), **suelo y sombra de contacto** al pie, la pinya trabada de M2 alrededor; altura = `S.castell.floors` (5–9); respuesta a la mano: en cada diana de la escalera (`kind: ladder`), un casteller de ≥ 1 m que trepa un tramo con cada eslabón; `slip`: el piso baja a la vista | Captura con 3 y con 8 pisos: la torre pisa el suelo; se distinguen los cuerpos; no flota |
| M4 | **El castell persiste:** `tronc3d` expone `setMode('build' \| 'top' \| 'crowned' \| 'down')` y lee `S.castell`; en `crowned` la enxaneta (cuerpo pequeño de `bodykit`) levanta el brazo en lo alto | En coronación se ve la misma torre, con sus pisos, coronada |
| M5 | **Pom** `pom3d.js`: dosos, acotxador y enxaneta son cuerpos sólidos que **trepan**; la luz del relevo los ilumina; el salto de +7 % por relevo y el resbalón se ven. La ciudad de líneas blancas (`:54-70`) pasa a fachadas de `room.matter.ceramic` oscuras bajo niebla, con ventanas cálidas | Captura del relevo: ninguna línea de 1 px; se lee quién sube |
| M6 | Traslación del mundo: en el Tronc el grupo `world` baja con la torre (la sala sube 3–6 m en 20–40 s, rampas de 3–5 s) | Sólo si M1–M5 están a las 04:30 |

**Blender:** el MCP no ha respondido en esta sesión de planificación. **No se cuenta con él.** `bakeBody` ya da mallas sólidas; un
GLB de Blender sólo compensaría para la porxada o un cuerpo con manos y cara, y eso es un extra de después de las 04:30.
**Depende de:** `room.matter` y `room.contactShadows` (VFX, 01:45–02:00; hasta entonces, materiales estándar); `S.castell`
(Interacción, 01:15); `wanted()` (Tech/QA).
**Hitos:** 02:00 M1 · 04:00 M2 y M3 con capturas · 05:30 M4 y M5, capturas con 1 y 15 manos.
**Recortar primero:** M6 → la ciudad del Pom (se queda en líneas, pero con las tres figuras sólidas) → detalle bajo de la multitud lejana (menos cuerpos) → M4 en el Pom (sí en coronación).
**No se recorta:** M1, M2 (la figura bajo la mano), la torre con suelo y sombra, y que Pinya y Tronc sean mundos claros: son la D5 y la D5b.
**Aceptación común:** luma de Pinya 0,35 ± 0,07 y de Tronc 0,45 ± 0,07, con p99 ≤ 0,85; colores sólo de `palette.js`.

### 5.8 Las lecciones de las referencias (`01`), dónde se aplican

| Lección | Dónde |
|---|---|
| Receta de estudio: AgX/Neutral, grano, sombra siempre, un sujeto, 1–3 tonos | V2, V3, V7; un héroe por bloque (la llama, la figura, la torre, la luz, la corona) |
| Respuesta en dos tiempos: sonido al instante, imagen que crece 300–600 ms | Brasa (a), M2, M3; el sonido ya recibe el `down` sin retardo |
| Huella persistente (Sequins) | V6 `room.heat`; hogueras; figuras trabadas; huellas del acta |
| Impacto irreversible y localizado (Shatter) | «Ha prendido» bajo la mano; `slip` del Tronc; resbalón del Pom |
| Cadena y contagio (Dominoes) | Relevo de la Brasa y del Pom |
| Cambio global con frente visible | Ola de la Brasa, frente del eco, `ach:lap` muro a muro |
| Presencia, no velocidad: permanencia, área, n.º de manos, distancia | El sistema de dianas (§2.6): todo avanza por permanencia; desaparecen las reglas de golpe, ventana y velocidad (§4.3) |
| Indicador dentro de la obra (el anillo de carga) | La diana es un objeto del mundo (vidrio y teselas, en el tono del capítulo), no una interfaz |
| Luz con forma + bruma, polvo con volumen | V1, V5 (la luz de los faroles entre columnas); 3–6 haces falsos sólo si sobra tiempo |
| Partículas con «hogar» y estado, fluido 2D de sala, DOF por capas, lente de mano | **Fuera esta noche** (§5.9) |

### 5.9 Explícitamente FUERA esta noche

Bloques nuevos o cambios de historia (D1) · SSGI, GTAO, SSR, DOF y godrays de pantalla (cuatro pases y halo en esquinas) ·
transmisión, cascadas, VSM · fluido 2D de sala y sistema de partículas con hogar y metamorfosis · la mano como foco real con
sombra · *splats*, assets de IA, física rígida · voz en catalán y líneas nuevas en inglés · varias luces simultáneas en el Pom · LUT 3D por capítulo (el etalonaje va por nodos) ·
manos que actúan durante la caída · rehacer la espera · el plan B en 2D (`res-obra`) · cualquier parámetro nuevo en el manifiesto ·
identidad de trazo común imagen/sonido (petición al estudio, ya anotada).

---

## 6. Integración y pruebas

### 6.1 Matriz de aforo (Interacción en Node; Tech/QA en el arnés con `?group=N`)

| Manos | Debe cumplirse |
|---|---|
| **1** | Cada bloque acaba con su final A **sin ayuda**: relevo de la Brasa ≤ 30 s, llamada con 1 diana sostenida, pilar (o torre si recorre dos muros), ≥ 6 pisos, Pom sin temblores imposibles, corona, eco de vuelta a su muro, bajada sin crujido por pérdida de trazo |
| **2** | Igual; la plomada se puede juzgar y conseguir con dos manos en un muro |
| **4** | Torre o tres; llamada con 1–2 dianas a la vez; un frente de eco a la vez |
| **8** | Tres o quatre; 2 corredores en la Brasa; ventana de la Pinya ≥ 3 m con todos en un muro; silencio con 0–1 manos de tolerancia |
| **15** (24–30 manos) | Nada se satura: llamada con 6 dianas a la vez como tope, l'aleta al 40 %; una mano que se mueve **no** para el aliento ni rompe el silencio; ≤ 4 frentes; respuesta visual plena hasta 16 manos y agregada por encima; duración del pase dentro de ± 10 % de la de 4 manos |
| Dianas, en todas | ≥ 1 libre por muro y una a ≤ 1,2 m de cada persona; ≤ 16; ninguna monopolizada; una sola mano hace avanzar cada bloque; dos manos de una persona pueden sostener una pareja; **la conducta «sólo golpes» no hace avanzar nada** |
| Todas | Duración total 8,5–10,5 min; con conducta pasiva, `assist:on` en cada bloque y el pase termina; con el grupo que **mengua de 15 a 2 a mitad de bloque**, el bloque termina sin esperar al reloj |

### 6.2 Pruebas en el arnés (escala 0,5, con cerrojo; las hace el Tech/QA, 04:30–06:00)

1. `shot.mjs` de cada bloque con `?capture&seed=3` y `group` 1, 4 y 15: código de salida 0 **y captura mirada**.
2. **L** (LiDAR) en Tronc, Pom y bajada: nada se rompe; los pisos no se pierden por un trazo partido.
3. **Costura:** mano fija en P3 junto al borde en Brasa (relevo) y festa (onda): sin corte de imagen, niebla, halo ni texto.
4. **Altura de niño (B):** anillo de inicio, palma, levantar (0,33 m repetidos entre 0,6 y 1,4 m), base del temblor, l'aleta (+0,28 m), banda de la bajada y huella: todo alcanzable por debajo de 1,4 m.
5. **Texto (B):** consignas entre 1,4 y 1,8 m con mayúscula ≥ 0,18 m; cartelas ≤ 2,1 m; ningún metadato.
6. **Voz:** en `/sound/ressonancia-sound`, un pase a ritmo ×8: cada línea una vez, en su muro.
7. **Visor:** con `?view=1` la página no publica nada en el canal.
8. **`?wallH=3.5`:** nada absoluto se sale (el perfil real aún dice 3,5 m).
9. **Cuatro parejas idénticas:** `cmp` de `score.js`, `tuning.js`, `targets.js`, `cues.js`.
10. **Dianas (B):** todas las esenciales entre 0,6 y 1,4 m o con variante infantil; Ø ≥ 0,44 m; con L, la carga no se pierde.
11. **Luz y color:** luma, p99 y quemado de cada capítulo contra §2.7; hoja de contactos de los diez capítulos en fila para ver la curva y la familia de color de un vistazo.
12. **Sonido (S4):** las 18 mezclas y su informe.

### 6.3 Álbum y rendimiento

- **Álbum** `lab/estudio/album4/`: «antes» a la 01:30, «después» a las 05:30, una hoja de contactos por bloque con 1 y 15 manos.
  El director la mira entera antes de autorizar la fusión.
- **Escala 1** (sólo en las dos ventanas autorizadas, sólo el Tech/QA): fps por bloque en calidad alta y media. Regla de decisión
  a las 05:45: si un bloque no da 60 fps en alta, la sala arranca en **media** (plan B, que hay que haber probado entero); si
  tampoco en media, se recorta en ese bloque lo último que entró (primero V7, luego la multitud de M2, luego las chispas).
- Tirones al cambiar de capítulo y tiempo en negro del arranque: medidos y anotados en `res-obra3d/NOTES.md`.

### 6.4 Fusión (06:00–06:30) e informe para el servidor

1. **05:00** congelación de reglas · **05:30** congelación de funciones (sólo arreglos) · **06:00** congelación total.
2. En `lab-vicente`: `node lab/tools/check-syntax.mjs`; `git status` limpio; `.gpu-lock` borrado.
3. En el árbol `integrate` (rama `integrate/ressonancia`):
   `node scripts/integrate-lab.mjs --from ../lab-vicente res-obra3d ressonancia ressonancia-sound res-3d-study --dry`, revisar tamaños
   (ningún archivo > 20 MB; sin `shots/`), y después sin `--dry`.
4. `npm run check` y `npm test` en verde (incluida la prueba de carpetas hermanas). Commit, fusión a `main`, `push`.
5. **Informe de la fase 2 para el servidor de la sala (07:00–09:00)**, en `docs/plans/INTEGRAR-RESSONANCIA.md`:
   - Corregir la altura de imagen del perfil (3,5 → 3,75 m si se confirma) **antes** de probar nada.
   - «Go to» en `none`; calidad inicial la que saliera de §6.3; `tuning: sala`.
   - Comprobar en `engine.log` que no aparece `Spout GPU path failed` (con WebGPU la caída a CPU es inviable).
   - Prueba de 10 s del `BroadcastChannel` entre la ventana de audio y la de salida: imagen y sonido en el mismo bloque y el mismo muro que llama.
   - Visor abierto: ningún golpe doble.
   - Máscaras: que el centro de ningún muro a 1,25 m caiga en una puerta o lámpara.
   - Audio: P2 y P3 comparten canal y no hay sub → la voz por muro se oye, pero no distingue P2 de P3 (lo cubren el texto y la imagen); escuchar si el grave queda delgado sin sub; nivel de la voz sobre la música.
   - Un pase entero con 1 persona y otro con todas las que haya, y fps a escala real con visor.
   - Qué mirar de lo nuevo: voz en el muro del temblor, pisos cantados, «La colla os ayuda», la figura bajo la mano, el castell en la coronación.
   - Qué queda para Beltrán a las 10:00: tolerancias del sensor real (quietud 0,15 m, subida 0,33 m), velocidad de la traslación del mundo si entró, y las líneas de voz que quiera regrabar.

---

## 7. Riesgos del plan y cómo se vigilan

| Riesgo | Señal | Respuesta |
|---|---|---|
| Las dianas son el cambio mayor de la noche y cruzan tres puestos (Interacción, Tech/QA, Narrativa) | `targets.js` sin API firme a la 01:00, o sin dibujo a las 02:30 | El director congela la API a la 01:00 aunque sea mínima (`field` y `together`); `chain` y `ladder` entran después. Si a las 03:00 no hay dibujo, las dianas se pintan con el anillo actual de la guía, que vuelve a Narrativa |
| Los mundos claros lavan el muro de enfrente o queman en el proyector | Sólo se ve en la sala | `exposure` como mando; `setGrade` con un segundo juego «sala» a −0,5 EV listo para elegir |
| La paleta no se aprueba a tiempo | 01:15 sin visto bueno | VFX arranca con V1 y V2 y la paleta de §2.7 como provisional; los tokens se cambian en un solo archivo |
| Sin clave de ElevenLabs o la API falla | 01:15 sin primera línea generada | Plan B de voz (§3) |
| `room3d.js` es cuello de botella (todo el aspecto pasa por un dueño) | V1–V3 sin commitear a las 02:00 | El director quita a VFX todo lo demás hasta entregarlos; Modelado sigue con materiales estándar |
| El cambio a AgX altera todas las escenas a la vez | Capturas «después» más apagadas o lavadas | `setGrade` por capítulo corrige exposición; si no se doma a las 03:00, vuelve ACES con los emisivos bajados |
| Cuerpos sólidos × 4 vistas no caben en 60 fps | Ventana de las 03:30 | Menos cuerpos y más niebla; el detalle bajo para todo lo que esté a más de 8 m |
| Los cambios de regla descuadran la duración del pase | El simulador sale de 8,5–10,5 min | Se ajustan `min/target/max` de `TIMES`, no las reglas de aforo |
| Dos agentes pisan el índice de git | `index.lock`, commits con archivos ajenos | §5.0; el Tech/QA revisa `git log --stat` cada hora |
| Lo estimado sobre el interior de las partes no era cierto | El dueño lo ve en su primera media hora | Lo dice a la **01:15** y el director recorta de la lista de «recortar primero» |
