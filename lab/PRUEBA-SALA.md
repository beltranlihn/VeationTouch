# Ressonància — prueba en la sala (XR Lab, 25-11-2026, 08:45)

Para Beltrán. Objetivo de la sesión: **ver la obra entera con el LiDAR real (4 × S2E) y el 4.1, y fijar los umbrales de interacción**
sin tocar código. Todo lo que hay que ajustar está en el panel de parámetros de la pieza visual (tarjeta de la experiencia en Live).
Duración prevista: ~2 h (carga 20 min · pase completo 15 min · bloque a bloque 75 min · pase final 10 min).

---

## 1. Cargar la obra en la app

La app (`npm start`) **sólo lista lo que hay en `experiences/`**; la obra vive en `lab/experiments/`. En el ordenador de la sala:

1. Traer la rama: `git fetch && git switch lab/vicente && git pull`.
2. Copiar **cinco carpetas** a `experiences/` con el mismo nombre (la pieza 3D importa `../ressonancia/` y `../res-3d-study/`; el
   servidor sólo sirve carpetas que son entradas del catálogo, por eso van todas). En PowerShell, desde la raíz del repo:
   ```powershell
   foreach ($d in "res-obra3d","ressonancia","ressonancia-sound","res-3d-study","res-obra") { Copy-Item -Recurse -Force "lab\experiments\$d" "experiences\$d" }
   ```
   Comprobar que `experiences\ressonancia-sound\audio\` tiene los `.mp3` (~19 MB) y `experiences\ressonancia\vendor\three-r187\` existe.
   **No se commitea** nada de `experiences/` (son copias para la prueba; se borran después o las integra el estudio).
3. Reiniciar VEATION Touch (el catálogo se lee al arrancar).
4. **Room** → perfil **«Barcelona XR Lab»** (el real, *no* «(simulated)»). Sensores conectados; prueba de paseo / verificación de la
   calibración en los 4 muros antes de empezar (sobre todo P3, el plano está a ~12 cm).
5. **Output › Screens**: salida encendida, **Scale 1**, 60 fps. **Output › Audio**: Audio encendido, dispositivos DVS y mapa del perfil
   (hoy P4 → 1, P1 → 3, P2 y P3 → 2, sin sub). Probar cada canal con **Test**.

En el catálogo aparecerán también «Ressonància» (el mosaico antiguo), «Ressonància — 3D study» y «Ressonància — the whole work
(assembly)» (la 2D de respaldo). **La que se prueba es «Ressonància — the whole work in 3D».**

## 2. Emparejar imagen y sonido

1. Live → estantería de experiencias → **«Ressonància — the whole work in 3D»** → **Play**.
2. Output › Audio → sección **Sound** → **«Ressonància — sound»** → **Play**.
3. **Manda el sonido**: la pieza de sonido ejecuta la partitura y la imagen la sigue por un `BroadcastChannel` (apaño del laboratorio).
   Comprobación en 10 s: en el panel de la visual, **Go to → III. Tronc**. En ≤ 0,5 s la imagen y la música deben cambiar a Tronc a la
   vez. Si la imagen salta y la música no (o al revés), el canal no llega entre la ventana de salida y la de audio: anotarlo y seguir
   (cada pieza correrá su propia partitura con las mismas manos; se desincronizan poco a poco).
4. **Ocultar la vista previa de la experiencia en Live** (botón **Experience**, junto a Points). La app abre la página **dos veces**
   (la sala y el visor) y las dos mandan impactos y saltos al sonido: con el visor abierto los golpes de las partes pueden sonar
   **dobles**. Escuchar un impacto con el visor encendido y apagado y anotar si cambia.
5. Volver **Go to** a **«—»** (el valor se guarda en el perfil: si se queda en «Tronc», la próxima carga salta a Tronc).

> ⚠️ **Umbrales y sonido.** Los umbrales del panel se aplican al instante en la partitura de la imagen y se envían al sonido
> (`ctl.times`). Para que el **sonido** (que es quien manda) los use, `ressonancia-sound/sound.js` necesita un parche de 2 líneas
> (`lab/estudio/notas/TUN.md` › «Parche sound.js»). **Si el commit de mañana no lo lleva**, para afinar umbrales: parar el sonido
> (Stop) mientras se ajusta un bloque → la imagen corre su propia partitura con los valores del panel; con el valor bueno, volver a
> poner el sonido. Confirmar con el director antes de entrar en la sala.

## 3. El panel: qué hay y cómo se usa

| Parámetro | Qué hace | En vivo |
|---|---|---|
| **Go to** | salta a un bloque (ensayo). Para repetir el mismo bloque: «—» y otra vez el bloque | sí |
| **Pace** | velocidad del reloj de la partitura (0,5–8). Útil: 4 en la intro para no esperar 70 s. **Volver a 1** | sí |
| Guide, Bloom, Exposure | guía (dianas y palabras), brillo, exposición | sí |
| **Quality** | high (sala, por defecto) / medium / low | **no**: Stop + Play |
| **Renderer** | auto (WebGPU) / WebGL2 | **no**: Stop + Play |
| **Mode** | auto (= sala dentro de la app) / room / lab. En sala la página ignora los interruptores de laboratorio de la URL | **no** |
| **Thresholds preset** | **Lab** = los valores de la partitura (empezar aquí) · **Room** = arranque tolerante (ventanas más anchas, quórums más bajos, «quieto» más permisivo) | sí |
| `t.…` (37) | cada umbral de la partitura (tabla abajo). **Un valor movido a mano manda sobre el preset** | sí |

Los valores se guardan en el perfil. Al cambiar uno, la consola de la página escribe `res-obra3d: thresholds {…}` con los efectivos.
**Apuntar siempre el valor bueno** en la hoja (§6): es lo que el estudio pasará a `TIMES` en `score.js`.

Umbrales (por defecto = partitura; entre paréntesis, el preset Room si cambia):

| Clave | Por defecto | Qué decide |
|---|---|---|
| `t.linger` | 2 s (3) | cuánto sigue «ocupado» un muro tras perder la mano (oclusión) |
| `t.abandon` | 45 s (60) | sala vacía → vuelve a la espera (aviso a la mitad) |
| `t.start` · `t.reveal.button` | 3 s · 0,55 m | espera: sostener el anillo de inicio · medio ancho del botón |
| `t.title` | 6 s | cartela de capítulo |
| `t.dup` | 0,10 m | id nuevo a < 10 cm de una mano viva = la misma mano |
| `t.hand.size` · `t.hand.span` | 0,12 m · 2 m | ancho de mano si el sensor no lo da · ventana de la Pinya |
| `t.hand.moved` · `t.hand.recent` | 0,10 m · 2 s | una mano ya apoyada cuenta media en el TOK si se movió / llegó hace poco |
| `t.brasa.early` · `t.brasa.late` · `t.brasa.max` | 0,5 (0,7) · 0,7 (1,0) · 75 s | ventana de la llamada alrededor del TOK · duración máxima |
| `t.pinya.pack.0` · `.1` | 0,55 (0,45) · 0,9 (0,8) | desde cuándo «apretados» empieza a llenar · lleno |
| `t.pinya.hold` · `t.pinya.net` | 3 s · 40 s | sostener el círculo · desde cuándo ayuda la colla |
| `t.tronc.rise` | 0,33 m (0,25) | **subida relativa que cuenta como levantar** |
| `t.tronc.foot` · `t.tronc.wobble` | 0,95 m (1,1) · 5 s (7) | temblor: manos por debajo de esta altura lo sujetan · tiempo para sujetarlo |
| `t.tronc.help` · `t.tronc.gain` | 0,5 · 0,72 | ayuda de los muros sin torre · velocidad de subida |
| `t.pom.still` | 0,15 m (0,22) | **«quieto» = se movió menos de esto en 1 s** |
| `t.pom.empty` | 20 s | sala vacía en el Pom → cae (aviso a los 10) |
| `t.aleta.rise` · `t.aleta.high` | 0,28 m (0,22) · 1,6 m | alzar cuenta desde esta subida · o mano por encima de 1,6 m |
| `t.aleta.quorum` · `t.aleta.window` | 0,6 (0,45) · 10 s | parte de las manos que corona · corona igualmente a los 10 s |
| `t.festa.early` · `.late` | 0,5 (0,7) · 0,7 (1,0) | ventana de la llamada final |
| `t.festa.window` · `.travel` · `.ghost` | 0,7 (1,0) · 3 s · 12 s | eco: margen para devolverlo · cruce del frente · la sala lo devuelve sola |
| `t.baixada.lower` · `.gentle` | 0,35 m (0,28) · 0,4 m/s (0,5) | **bajada que cuenta** (2 pisos) · más rápido que esto cruje |
| `t.baixada.empty` · `.outside` | 10 s (14) · 0,5 | soltar todo → carregat · peso de los muros sin torre |

No están en el panel (escritos en el código; si la sala los pide, el estudio los pasa a parámetros): la zona «cerca del centro» de la
Pinya (llena hasta 1,8 m del centro del muro, nada a 3 m) y el umbral de 0,15 m que distingue «base» en el Tronc.

## 4. Lista bloque a bloque

Hacer cada bloque **primero con 1 persona, luego con 3–5**. Saltar con **Go to**. Mirar la vista Live (puntos del sensor) a la vez
que el muro: si una mano no aparece en Live, es el sensor, no la obra.

| Bloque | Qué hacer con las manos | Qué debe pasar | Si no pasa, tocar | Anotar |
|---|---|---|---|---|
| **Espera** (umbral) | tocar en cualquier sitio; jugar con las piezas; cuando aparezca el anillo, **sostenerlo** («Sostened el anillo para empezar») | las piezas caen al tocar; el botón se revela jugando (~30–40 s en solitario); sostener ~3 s arranca | `t.start`, `t.reveal.button`, `t.linger` | segundos hasta revelar y hasta arrancar; si el anillo «se suelta» solo |
| **Intro** (La plaça) | nada (70 s; Pace 4 para pasar rápido) | la plaza nocturna; se rompe en losas al final | Bloom, Exposure | luz en proyección, **costura P3/P4**, tirón al cambiar de bloque, sincronía imagen–música |
| **I. Brasa** | tocar → brasas; luego la **llamada** («Con el tambor»): tok… tok… **TOK**, golpear el muro en el TOK. Tres llamadas: un muro, dos opuestos, los cuatro | respuesta inmediata del sonido al tocar; ola grande si se acierta el TOK; golpear a destiempo NO da ola | `t.brasa.early`, `t.brasa.late`, `t.hand.moved`, `t.hand.recent` | aciertos/llamadas; ¿se siente justo con el retraso de la imagen (~200 ms)? |
| **II. Pinya** | «Juntaos»: palma con palma, luego **apretarse** hombro con hombro cerca del centro del muro y sostener | los círculos se llenan según lo apretados (no por tiempo); sostener 3 s cierra; manos separadas NO cierran | `t.pinya.pack.0/.1`, `t.hand.span`, `t.hand.size`, `t.pinya.hold`, `t.pinya.net` | **cuántas manos ve Live en una fila apretada** (oclusión); P3 (antebrazo = manos más anchas) |
| **III. Tronc** | «Levantad»: **subir la mano deslizándola por el muro** ~30 cm en cada frase (reunir → subir → encajar, 4,8 s); un lado más alto inclina la torre; en el penúltimo piso, temblor: «Sujetad la base» = manos abajo | con manos quietas sube muy despacio; subiendo, un piso por frase; la torre se inclina hacia el lado bajo; el temblor se salva bajando las manos | `t.tronc.rise`, `t.tronc.gain`, `t.tronc.help`, `t.tronc.foot`, `t.tronc.wobble` | **estabilidad de la altura** (¿±10 cm a 10 Hz?); manos en fila subiendo: ¿se pierden?; pisos en 60 s |
| **IV. Pom de dalt** | «Quietos»: manos apoyadas y quietas. Tres subidas: relevo (la luz pasa a la siguiente mano quieta, en cualquier muro), aliento (toda la sala quieta), silencio (nadie se mueve) | la luz sube con la quietud; moverse la hace titubear; sala vacía 20 s → cae (aviso a los 10) | **`t.pom.still`**, `t.pom.empty` | **temblor de una mano «quieta» en el S2E** (si sale «inquieta» sin moverse, subir `still`); adulto + niño |
| **V. L'aleta** (corona) | sin texto: la voz pide alzar la mano. **Alzar la mano** ≥ 28 cm o por encima de 1,6 m | corona antes y más ancha si la mayoría alza; si nadie, corona a los 10 s, estrecha | `t.aleta.rise`, `t.aleta.high`, `t.aleta.quorum`, `t.aleta.window` | con 5+ personas alzando: ¿cuántas manos ve Live? (sombras del sensor arriba) |
| **V. La ressonància** (festa) | libre 20 s; luego **eco**: tocar → un frente cruza al muro de enfrente (~3 s); tocar ese muro cuando llega lo devuelve doblado; al final la **llamada** final y el florecimiento | el eco se ve y se oye cruzar; si nadie devuelve, la sala lo devuelve a los 12 s; **florece siempre**, más grande con unísono | `t.festa.window`, `t.festa.travel`, `t.festa.ghost`, `t.festa.early/.late` | ¿se ve el frente desde el centro?; ¿el eco se oye en el muro correcto con el mapa real de audio (P2 y P3 comparten canal)? |
| **La baixada** | «Bajadlo despacio»: manos arriba y **bajarlas despacio** juntas; soltar todo = caída | cada bajada ≥ 35 cm baja dos pisos; despacio limpio, rápido cruje; soltar 10 s → carregat (cae) | `t.baixada.lower`, `t.baixada.gentle`, `t.baixada.empty`, `t.baixada.outside` | segundos hasta descarregat; ¿cruje sin querer? |
| **Caída / L'acta** | apoyar la mano un momento (entre 3 y 15 s del acta) | el castell se disuelve; el acta «X de Y · descarregat/carregat», cuatro valores; cada mano apoyada ≥ 0,5 s deja una **huella** (si T-050 llegó) | — | ¿se leen las palabras a 3 m?; huellas en el muro correcto; vuelve a la espera sola |

Al final: **un pase completo** con el grupo, sin tocar el panel (Go to «—», Pace 1), cronometrado (objetivo ~10 min).

## 5. Riesgos conocidos (qué mirar)

1. **P3, plano a ~12 cm** del muro: reacciona antes del toque y entra antebrazo → manos más anchas (`size`), más sombra; la Pinya y
   el `span` pueden leer de más. Comparar el mismo gesto en P3 y en P1.
2. **Oclusión con el sensor arriba**: una fila hombro con hombro (Pinya), manos subiendo en fila (Tronc), muchas manos alzadas
   (l'aleta), adulto junto a niño. Si se pierden manos: Thresholds preset **Room**, o bajar `t.aleta.quorum`, subir `t.linger`.
3. **Latencia**: la imagen responde ~150 ms tarde a propósito (+ frame + proyector ≈ 200–250 ms); el sonido, al instante. Las ventanas
   de las llamadas (`early/late`) deben cubrirlo.
4. **Dos instancias** (sala + visor) duplican los impactos y los saltos hacia el sonido: ocultar la vista previa (§2.4).
5. **Canal imagen ↔ sonido** = `BroadcastChannel` (apaño del laboratorio). Si falla, cada pieza corre su partitura.
6. **Mapa de audio**: P2 y P3 comparten canal y no hay sub: la llamada entre muros opuestos y el eco pueden no localizarse.
7. **Tirones al cambiar de capítulo**: 60–77 ms en el Mac de desarrollo; medir en la RTX (fps de la tarjeta).
8. **Nadie ha oído aún la obra con la imagen en una sala real**: anotar todo desajuste de sincronía.
9. El parche de umbrales del sonido puede no estar (ver ⚠️ en §2).

## 6. Hoja de anotación (copiar en papel)

| Bloque | Personas | Valor probado (clave = valor) | ¿Funciona? | Manos que ve Live vs reales | Notas (sonido, imagen, latencia) |
|---|---|---|---|---|---|
| | | | | | |

Al final, fotografiar el panel (o copiar la línea `res-obra3d: thresholds {…}` de la consola) y mandarlo al estudio.

## 7. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| La 3D no arranca, pantalla negra o error en la tarjeta | **Renderer → WebGL2**, Stop + Play. Si sigue: **Quality → medium**, Stop + Play |
| Va a tirones (fps < 50 en la tarjeta) | **Quality → medium** (Stop + Play); comprobar Output Scale 1 y que el visor está oculto |
| Nada se dispara con la gente | **Thresholds preset → Room** (en vivo); luego afinar la clave del bloque (§4) |
| Un bloque se atasca | **Go to** → el bloque siguiente (o «—» y de nuevo el bloque para repetirlo) |
| Imagen y sonido desincronizados | Stop del sonido y Play de nuevo (la imagen lo vuelve a seguir en < 1 s); si no, seguir con cada pieza por su cuenta |
| Impactos que suenan dobles | ocultar la vista previa de la experiencia en Live (§2.4) |
| Plan B entero | **«Ressonància — the whole work (assembly)»** (`res-obra`, la versión 2D): la misma partitura y el mismo sonido, más ligera. No tiene el panel de umbrales |
| La obra se queda en un bloque al recargar | **Go to** estaba guardado en un bloque: ponerlo en «—» |

Contacto en el estudio: el director (Claude, `lab/estudio/`). Detalle técnico: `experiments/res-obra3d/NOTES.md`,
`RESSONANCIA.md` §8–§9, `experiments/ressonancia/PLAN-INTERACCION.md` §3, `estudio/notas/TUN.md`.
