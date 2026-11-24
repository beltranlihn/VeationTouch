# Cuaderno de 3D-FE

## Dónde quedé (23-11, 22:32) — T-004 entregado, espera QA
Archivos: `lab/experiments/ressonancia/scenes3d/parts/festa3d.js`, `lab/experiments/res-3d-study/parts/festa3d.json`.

**Qué es.** Una placa luminosa a `depth` (1,1 m) detrás de los cuatro muros (copia radial de los planos de muro desde el ojo: en
reposo cada punto está detrás del punto de muro por el que se ve; las cuatro esquinas casan). La mueve un **campo de ondas en GPU**
(ecuación de ondas 2D perímetro × altura, periódica, en dos render targets float con ping-pong, sub-pasos CFL ≤ 0,5; 30 celdas/m,
≈ 828 × 113) portado de festa.js 2D (amortiguación, viscosidad, muelle, recorte suave, «hush» donde ya suena). Luz: filigrana de oro
en las curvas de nivel de la amplitud, brillo de relieve (perla con irisación tenue), neblina roja castell, líneas nodales.
**Arena**: 600 000 partículas en compute (WebGPU y WebGL2) sobre la placa: saltan donde vibra y bajan por el gradiente de amplitud
hacia los nodos → las figuras estacionarias juntan la arena en líneas de Chladni, con relieve y saltos hacia la sala.
**Manos**: `input.downs` → impulso el mismo frame (anillo que da la vuelta a la sala e interfiere); mano quieta → drive suave con
frecuencia propia que se engancha al modo de la sala al subir la resonancia; mano arrastrada → estela.
**Regla oculta**: R = `state.resonance` (o, en el estudio sin state, réplica de la regla del score) + `params.resonance`. Al subir:
dos modos casi degenerados forzados (figura ordenada), la arena a los nodos, la luz sube por los muros, oro → oro blanco, y la
imagen se rompe en **bandas ordenadas** (carreras tipo pixel-sort: oro, perla, rara irisación; estelas alargadas en la arena).
Evento `'bloom'` (o `params.bloomNow`) → 4,2 s de figura total, y relaja.
**Coronación** (`state.block==='crown'`, `state.t` 0–25; `params.crown` lo sustituye): punto de la enxaneta arriba en el muro 0 →
destello que recorre la parte alta de los cuatro muros y se encuentra enfrente (5 s) → la noche se abre celda a celda desde arriba
(grietas de oro, blanco cálido detrás, banda 0,9–1,6 m atenuada) → lluvia lenta de oro en profundidad (6–19 s) → respiración
contenida (16–20: la lluvia se queda suspendida) → soltada a los 20 s: un frente de onda cae desde arriba por toda la sala, la lluvia
se posa como arena y la luz exhala hacia la ressonància.
**arrive**: fragmentos de noche (espejos oscuros) flotan a 5,5–11,5 m, estallan en oro y sus partículas vuelan a la placa; la placa
se abre celda a celda. **leave**: el campo se congela (0–0,15) y la arena y fragmentos de oro caen lentamente; la placa se apaga
celda a celda. Getters de sólo lectura: `part.resonance`, `part.bloom`.

**Lectura de input**: `state.block`, `state.t`, `state.resonance`; `events` 'bloom' y 'crown'; `arrive`, `leave`, `hands`, `downs`.

**Parámetros**: mode, crown, resonance, bloomNow, auto, arrive, leave, speed, ring, clip, glow, lines, relief, depth (al cargar),
sand, sandGlow, bands, sensitivity.

**Evidencia** (check.mjs, `errors: []` en todas; WebGL2 comprobado `"webgl2"`):
- coronación (crown 0,6): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/crown.png`
- 2 manos, resonancia baja: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/two.png`
- resonancia alta (0,9, WebGL2): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/high.png`
- bloom: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/bloom.png`
- llegada: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/arrive.png` · salida: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/leave.png`

**fps**: SIN MEDIR (no tengo turno GPU-MEDICIÓN). Coste esperado: sim ~5 pases de 94k px, compute 600k, placa a pantalla completa
con ~10 lecturas de textura por píxel, 600k sprites × 4 vistas. Si no llega a 50 fps en el M1: bajar NP (constante arriba del archivo)
a 300k.

## Hallazgos y trampas
- **Choque de nombres**: el host del estudio ya tiene un parámetro `bloom` (fuerza del bloom, 0,6). El disparador de la pieza se
  llama por eso `bloomNow`, no `bloom` como pedía el ticket.
- Los render targets float (FloatType) se leen bien en WebGPU y WebGL2 con QuadMesh + `texture().sample()`; el compute lee la textura
  derivada con `.level(0)` en los dos backends.

## Traspasos a otros roles
- INT: el host no pasa `input.state/events/arrive/leave` en res-3d-study (la pieza fabrica su sustituto). En res-obra3d, hay que pasar
  `state.block==='crown'` con `state.t`, y el evento 'bloom'. El bloom del host (umbral 0,75) hace el resto.
- Puntos débiles: bandas a resonancia alta aún algo «ruidosas» (bajar con `bands`); en la salida aparece una línea fina de arena
  acumulada bajo el techo de la esponja; las grietas de la coronación son muy regulares; sin prueba con 15 manos reales (group=8 es el
  máximo del arnés); sin fps.

## T-010 (23-11, 22:55) — entregado, espera QA
Respaldo de la versión que pasó T-004: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/festa3d.T-004.js`.
Cambios en `festa3d.js` (contrato, parámetros, física, llegada/salida sin cambios):
1. **Coste WebGL2**: 300k partículas en WebGL2 (600k en WebGPU) con `sandGlow` ×1,4; fuera el bucle de manos del compute (era 15 × 600k
   por frame); el drive de manos en la simulación sólo dentro de 4σ; Voronoi sólo cuando hay coronación, llegada o salida
   (`U.cells`). **fps sin medir**: pido medición a QA (WebGL2, 15 manos, resonance 1).
2. **Bandas**: menos bloques (≤ ~30 %), aparecen con fundido al subir la resonancia, un color por bloque (oro blanco, perla, rara vez
   rosa o hielo: **sin verde**), carreras más largas sin negro, sin desplazamiento horizontal. La irisación del brillo va rosa↔hielo.
3. **Coronación**: celdas más grandes y deformadas (dominio deformado periódico), grietas de grosor y brillo variables, la mayoría se
   apagan al abrir y ~28 % quedan como hilo; el fondo de cada celda queda oscuro y la luz entra desde las grietas (oro profundo,
   blanco sólo arriba). **Línea blanca de arriba**: era el anillo del destello, que duraba hasta 20 s; ahora se apaga entre 6,5 y 11 s.
   Además la arena ya no se acumula en una línea bajo el borde superior.
Evidencia (errors: [] en todas): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/t10_crown06.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/t10_crown035.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/t10_res1.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/t10_gl.png` (webgl2, 8 manos, res 1).

## T-010b (23-11) — regresión de QA corregida
Causa: `smoothstep(hk - 0.06, hk, bandK·0.32)` es > 0 con bandK = 0 cuando el hash del bloque hk < 0,06 → un bloque fijo (P2,
x 4650–4950) quedaba activo siempre. Arreglo: umbral `hk1 = 0,06 + 0,94·hk`, nunca por debajo de 0,06. Captura a resonancia 0, P2
x 4350–5250 limpia: `scratchpad/festa3d/t10b_res0_P2.png` (errors: []).

## T-011 (23-11, 23:20) — castell: rendimiento — entregado, espera medida de QA
Plan y detalle: `tickets/T-011-3DFE-castell-perf.md`. En `castell.js` (respaldo `scratchpad/castell/castell.T-011-before.js`):
LOD por visibilidad (cara de atrás 30 %, pinya trasera 45 %, energía compensada), oclusor sólo con las de delante (geometría que comparte
buffers), aura 1,5 % ×3 luz (era 4,5 %), esfera de recorte más ajustada. Por castell: 160k → 105k dibujadas, oclusor 160k → 71k.
`buildPer/disPer/show/tilt` sin tocar. Capturas: `scratchpad/castell/zoom_f2.png`, `zoom_f8.png` (antes | después): mismo aspecto
(diferencias = guía/cartela y respiración, por el momento de la captura). Sin errores. Si QA mide < 45: paso 5 del ticket.

## T-004b (23-11, 23:18) — las 3 mejoras no bloqueantes de QA › T-004
Ya están hechas en T-010 / T-010b (misma lista: coronación oscura con luz en las grietas y celdas irregulares; el anillo blanco de arriba
se apaga entre 6,5 y 11 s y la arena no hace línea bajo el techo; sin verde en las bandas). QA lo verificó en su veredicto de T-010.
Sin cambios de código (respaldo igualmente en `scratchpad/festa3d/festa3d.T-004b-before.js`). Capturas: `scratchpad/festa3d/t10_crown06.png`,
`t10_crown035.png`, `t10_res1.png`, `t10b_res0_P2.png` (resonancia 0 en P2 limpia). Si hace falta, re-capturo después de las 23:50.

## T-011 paso 5 (23-11, 23:35) — entregado para medida de QA
`castell.js` (respaldo del paso 4: `scratchpad/castell/castell.T-011-step4.js`): cara de atrás 20 % (era 30 %), pinya trasera 30 % (era 45 %),
oclusor con la mitad de las de delante a 2,0× de tamaño (era todas a 1,5×). Por castell: 93k dibujadas (eran 160k al principio), oclusor 36k
(eran 160k). Recortes antes|después a resolución completa: `scratchpad/castell/zoom5_f2.png`, `zoom5_f8.png` — mismo aspecto.
**MSAA 2 en high** (permiso DECISIONES 23:26): `res-obra3d/experience.js` línea 37, `samples` 4 → 2 (respaldo
`scratchpad/castell/obra-experience.before-msaa2.js`). Recortes ×2 MSAA 4 | MSAA 2: `scratchpad/castell/msaa_cmp.png` (castell) y
`msaa_cmp_plaza.png` (piedra, farola): a ojo iguales. Afecta a todos los bloques en high (intro incluida). Sin errores.

## T-014 (23-11, 23:35) — la ressonància libre — entregado
Ticket `tickets/T-014-3DFE-ressonancia-libre.md`. Respaldo `scratchpad/festa3d/festa3d.T-014-before.js`. Sólo `festa3d.js`.
1. **Solo**: además del anillo y el destello del mismo frame, una mano quieta abre una roseta de oro fino (6 + 12 pétalos, 0,1 → ~0,7 m en
   ~6 s, giro lento); se atenúa con muchas manos.
2. **Pico de grupo** (con el 'bloom' del score / la regla sustituta / `bloomNow`): una grieta de luz nace en el centro circular de las
   manos, corre a 9 m/s en los dos sentidos a ~2,15 m, da la vuelta cruzando P3→P4 y se encuentra enfrente; frente de onda horizontal;
   la placa se abre en celdas alrededor de la grieta (como la coronación) y se cierra (~6,5 s, subida 0,35 s).
3. Arreglo de paso: el relieve se anula en los 0,4 m junto a las esquinas (los planos de dos muros desplazaban distinto y dejaban un corte
   fino en las esquinas con amplitud alta).
Evidencia (scratchpad/festa3d/, errors: [] en todas): `t14_board.png` (filas: 1 mano sin pico = roseta · 1 mano pico · 4 manos a 0,9 s
con la grieta corriendo · 4 manos pico · 15 manos pico), `t14_solo_zoom.png`, `t14_peak4_seam.png` y `t14_peak15_seam.png` (costura
P3|P4 continua), `t14_res0_P2.png` (resonancia 0 limpia en P2), `t14_gl.png` (WebGL2, 4 manos, pico).
Débil: con la placa abierta el pico es denso a 15 manos (muchas líneas a la vez); fps sin medir (T-014 añade un If por mano y un bloque
de celdas sólo durante el pico).

## T-014b (23-11, 23:37) — pico menos cargado — entregado
Respaldo `scratchpad/festa3d/festa3d.T-014b-before.js`. (1) Bajo el pico el campo, las bandas, la arena y la luz de las manos bajan a ~30 %
(~22 % con 15 manos) y vuelven al cerrarse; (2) las celdas se abren sólo cerca de la grieta (≤ ~0,6 m arriba/abajo), con grietas y luz más
tenues; fracción de muro con luma > 40 en el pico: 4 manos 18–21 %, 15 manos 21–23 % (≤ 35 %); (3) las rayas verticales eran las bandas
de pixel-sort que el bloom encendía: ahora no hay bandas bajo el pico (bandK × duck). Roseta y grieta en marcha sin cambios.
Evidencia (scratchpad/festa3d/, errors: []): `t14b_board.png` (4 y 15 manos), `t14b_p2zoom.png` (P2→P3 sin rayas), `t14b_peak4_seam.png`,
`t14b_peak15_seam.png` (costura continua), `t14b_res0_P2.png` (P2 limpio, 4 % > 40 sólo por una curva normal), `t14b_gl15.png` (WebGL2, 15 manos).

## T-018 (23-11, 23:42) — coronación y floración — entregado
Ver `tickets/T-018-3DFE-coronacion.md`. Evidencia (scratchpad/festa3d/, errors: [] en todas): `t18_crown_board.png` (0/5/10/15/20/25 s),
`t18_bloom_board.png` (−1/0/+2/+5 s; el +5 rehecho tras retrasar las bandas: `t18_bloom_5000.png`, luma media 138, p99 214: el fotograma
más claro de la obra, sin blancos quemados), `t18_checks.png` (costura floración | costura coronación 15 s | P2 resonancia 0 limpio),
`t18_gl.png` y `t18_gl_crown.png` (WebGL2). Débil: a +5 s el lavado es algo plano/beis; la arena se lee como grano sobre la luz.

## Dónde quedé (24-11, 00:16) — parada por límite de uso; festa3d.js funciona (errors: [] en las últimas comprobaciones)
Hecho desde T-018 (respaldos `scratchpad/festa3d/festa3d.T-018b-before.js`, `festa3d.T-022-before.js`):
- **Parpadeo**: causa = la fase viva de la onda (relieve y brillo con h, latido 2ω de A con varias frecuencias), las bandas de pixel-sort
  que copiaban líneas finas a toda la carrera y el destello de aterrizaje. Arreglos: relieve/brillo con q en vez de h; media temporal del
  campo (~0,12·Ve s); A = rms corriente cuando suena mucho (rmsK); bandas llevan la amplitud suave, no líneas; destello de mano con caída
  suave; arena sin salto rápido y con menos contraste. Resonancia 1, group=4, método de QA (shimmer): **1,1–3,3 %** (era 26–38 %);
  depende de la carga de la máquina (a 30 fps sube).
- **Relleno de la coronación** con profundidad (rojo castell abajo → oro → blanco cálido arriba, facetas de celdas, relieve) y **coronas**
  de oro de ~0,85 m en lo alto del centro de cada muro: `t18c_crown_board.png`.
- **Floración**: un solo envolvente geométrico (×1,5/s, 5,5 s) para bloom, lavado, apertura de celdas y regreso del campo; lavado sólo
  en el primer 'bloom' del pase (luego, sólo la grieta); calma en ~7,5 s. Serie: máx ×1,9/s, pico luma 137, 0 % a 255
  (`t18c_bloom_series10.json`); tablero `t18c_bloom_board.png` (capturado antes del último ajuste de bandas/destello).
- **T-022 (transiciones)**: llegada = fragmentos de oro que caen desde arriba a su sitio y celdas que se encienden de arriba abajo
  (`t22_arrive_board.png`); salida = todas las celdas a la vez, placa fuera en leave 0,6 (~3 s), arena y esquirlas caen cada una a su
  ritmo y se apagan en 0,7–0,8 (`t22_leave_board.png`). Sin peak ni lavado durante la salida. **Sin verificar en res-obra3d**: la «arista
  vertical» de la hoja de 3D-PI no la reproduje en el estudio; mi hipótesis es el pico/lavado o la placa aún entera en +3 s (ambos
  quitados).
Pendiente: re-capturar tableros finales (floración −1/0/+2/+5, costura, P2 res 0, WebGL2) con la versión final; comprobar T-022 en
res-obra3d; fps por QA; filas T-018/T-022 del TABLERO a «entregado».

## 24-11, 03:26 — T-018 final, T-022 en la obra, hallazgos del álbum (T-023)
- **Álbum festa (raíl negro arriba)**: el techo de luz era un corte duro y la arena se acumulaba bajo él → techo suave (mínimo 15 %), arena
  atenuada sobre el techo. Además, una barra blanca junto a manos en movimiento: brillo de relieve sin límite (pendiente de q) → limitado;
  y la arena ya no colapsa en líneas sólidas (deriva acotada + difusión constante). `t23_festa1.png`, `t22o/festa_obra_pair.png` (en la obra).
- **Álbum coronación (lavado beis)**: la lluvia eran todas las partículas → sólo el 9 % llueve (gotas); la arena se atenúa bajo el relleno;
  relleno y lavado en oro (no blanco-beis) con profundidad. `t18d_crown_0.64.png`, `t18d_check.png`.
- **Floración** (serie `t18d_bloom_series.json`): máx ×1,75/s, pico luma 120, 0 % a 255, ~35 a los 8 s; bandas en oro cálido (sin gris)
  y sólo con Rs > 0,8. Tableros `t18d_bloom_board.png` (−1/0/+2/+5; −1 y +2 de la versión anterior a las bandas doradas), `t18d_bloom_seam.png`
  (costura continua), `t18d_res0_P2.png` (P2 limpio, 0,9 % > 40), `t18d_gl.png` (WebGL2). Parpadeo a resonancia 1: 1,5–1,8 %.
- **T-022 en res-obra3d** (`t22o/sheet_festa-baixada.png`, `sheet_pom-crown.png`): festa→baixada ya está oscuro a +1,5 s, sin arista vertical
  ni curvas sobre el castell. pom→crown: la «red de triángulos» de +1,5 s es cielo azul con alambre de oro = **la salida de pom3d** (3D-PO/INT),
  no festa3d; a +3 s llegan mis fragmentos de oro desde arriba; a +5 s coronado.

## 24-11, 04:20 — hallazgos del pase natural (3D-PI)
Respaldo `scratchpad/festa3d/festa3d.T-pass-before.js`.
- **Barras blancas planas en los círculos**: una mano rápida (el público virtual salta) metía una estela enorme → A gigante → la placa
  se disparaba hacia el ojo (haz blanco) y las bandas copiaban un solo punto en losa. Arreglo: velocidad de estela ≤ 1 m/s, A y q acotados
  (0,75) y relieve acotado; las bandas tiñen las líneas locales (nunca una losa).
- **Raíl blanco arriba**: el anillo del destello de la coronación duraba hasta 11 s en blanco → ahora oro, más fino, 70 %, fuera a los 9 s.
  En festa no queda raíl (techo suave de 03:20).
Evidencia (errors: []): `t22o/festa_obra34.png` (festa en la obra, 6 y 10 personas), `tp_festa8.png` (group=8, res 0,9), `tp_crown5.png`.

## T-032 (24-11, primera versión visible) — Tronc: la torre-ensamblaje
Ticket `tickets/T-032-3DFE-torre.md`. `tronc3d.js` reescrito (respaldo `parts/tronc3d.ARTE2.js.bak`; `res-3d-study/parts/tronc3d.json.ARTE2.bak`).
- **Qué hay:** por muro de estructura, a 6,5 m, una torre flotante (escala 1,5) de base de piedra + 9 pisos = los 9 de la partitura: tambor de
  ladrillo, anillo de trencadís, balcón de hierro, esfera de cromo con anillo de oro y satélites, macetas con flores, caja de vidrio con núcleo
  de luz, corro de 7 cuerpos de luz, chimenea Gaudí de trencadís, aguja de oro (enxaneta). Cada piso gira lento con su collage alrededor
  (cubos de vidrio, paneles de vidrio, fibras colgantes de oro/brasa: refs. 9 y 10). Sombreado TSL propio con entorno procedural (cromo,
  esmalte, terracota, hierro, oro, vidrio aditivo con aristas). Sin luces de escena, sin assets externos. ~3500 instancias en 7 mallas.
- **Pulso:** el piso en formación flota disperso y se acerca con `floorProgress`; al fijarse cae a su sitio en 0,75 s con aceleración, la torre
  se hunde y rebota (muelle) y destella (también los dos pisos de abajo).
- **Física:** inclinación = muelle amortiguado hacia lean·7° (oscila); weak tiembla más arriba. Inclinada, las piezas sueltas (tejas, cascotes,
  macetas con sus flores, satélites, cubos, teselas de chimenea) se sueltan, resbalan por las cubiertas con la gravedad inclinada, caen, rebotan
  en los pisos de abajo (restitución 0,32, giro), se pierden en el vacío; con la torre recta 2 s vuelven en arco.
  **Tocar:** una mano que aterriza golpea el piso detrás a su altura (rayo ojo→mano→torre): bamboleo, destello, 1–3 piezas caen; las teselas
  cercanas (≤ 0,75 m de la mano) salen despedidas girando con gravedad y reaparecen luego. Mismo frame. Medido con group=8: 49 piezas libres
  en 4 s, 9 impactos.
- **Capas:** teselas a 0,1–1 m tras el muro (fuera de la banda del centro 0,6–2,5 m) · torres a 6,5 m · escombros de ciudad 26–70 m y polvo.
- **Sala:** el grupo `world` baja = la sala sube (forming floor a ~3 m sobre la base), ≤ 0,35 m/s con aceleración ≤ 0,25 m/s²; en premio
  y salida sigue subiendo (hacia el Pom). Parámetro `rise` (0 = quieta).
- **arrive/leave:** fragmentación (llegan girando de abajo arriba; se van subiendo y separándose). **Premio:** la luz se apaga de arriba abajo.
- **Sonido (ola 2):** `part.impacts` / `window.__tronc3d.impacts` = impactos del frame `{ wall, u, force }` (propuesta 'fx:impact').
- **Ola 2 (pedido del director):** `part.collapse()` ya existe en esbozo (suelta todas las piezas fijadas con impulso aleatorio);
  falta guionarlo para baixada/fall (orden de arriba abajo, grieta, sin vuelta a casa) y que fall3d/INT lo llame.
- **Evidencia** (`errors: []` en todas, WebGPU; WebGL2 `"webgl2"` sin errores):
  tablero muro P1 (pisos 2 · 5 inclinada lean 1 weak 2 · 9): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/e_board.png`; tiras completas `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/e_f2_strip.png`,
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/e_f5lean_strip.png`, `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/e_f9_strip.png`; WebGL2 + arrive 0,5 + leave 0,5: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/c_board.png`;
  en la obra (`review.html?from=tronc`, 6 personas, ritmo 6): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/d_obra.png` (aún con plaza y castell del host encima; 0 errores, pisos 0→7).
- **Débil / falta:** con la plaza del host todavía visible el suelo tapa la base y lo que cae (se arregla con sólo tronc3d+atmos, aprobado);
  cuerpos de luz algo planos (siluetas beige); a ritmo 6 la subida va por detrás de los pisos (a ritmo 1 no); fps sin medir (QA).

## T-032 · pasada de arte (pedido del director, contra refs. 9 y 10)
Respaldo de la primera versión: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/tronc3d.T-032-v1.js`.
1. **Fuera la lluvia uniforme**: ya no hay cubos de vidrio ni esquirlas por todas partes. Ahora hay **cúmulos** de escombros (2 grandes, 9 medianos, 26 pequeños,
   casi gaussianos, estirados a lo largo de la órbita) en 4 pisos de cada torre, que giran con su piso y aparecen cuando el piso existe; cerca del muro, 4 cúmulos
   por muro fuera de la columna de la guía; lejos, 6 nubes de escombros con su polvo de brasa. Entre medias, oscuridad.
2. **Torres dominantes**: escala 2,1 (era 1,5), base más ancha (18 piedras, r 1,55), el anillo de trencadís con 4×38 teselas, la esfera con un anillo de 26
   teselas y 11 satélites; la subida deja el piso en formación arriba (sale por lo alto del muro).
3. **Materia**: texturas **procedurales en el shader**, sin archivos: relieve por ruido por materia (piedra rugosa, grano de terracota, ondulación del esmalte),
   craquelado del esmalte (ruido de crestas), óxido en el hierro (manchas que apagan el brillo), rocas irregulares; cromo, oro y vidrio leen `room.envMap` (PMREM de INT)
   mezclado con mi entorno procedural; vidrio con película fina (rosa-oro-turquesa en el borde) y aristas. **No descargué texturas CC0 de Poly Haven ni de ambientCG**:
   bajar archivos de internet necesita un sí de Vicente en el chat, no basta un mensaje entre agentes. Si Vicente lo aprueba, se pueden cambiar por mapas de normal y rugosidad.
4. **Luz**: luz principal cálida y contraluz turquesa en todas las materias, humo en la base de cada torre (14 velos con ruido, que miran al ojo, cálidos y
   turquesa), fondo en degradado profundo (noche azul-turquesa arriba, una línea cálida fina en el horizonte, negro abajo) y caída a la oscuridad por debajo del ojo.
5. **Paneles de collage** con tiras *pixel-sort* (columnas de color de largos distintos, bloques desplazados, marco fino): 3 por muro en la capa cercana y alguno en los cúmulos.
6. **Cuerpos de luz**: núcleo ámbar con profundidad (más luz de frente, más oscuro hacia el borde) y borde turquesa y oro.
- **Arreglo en la obra**: con 6 personas el brillo de mano sostenida y el destello sumaban blanco y quemaban las torres. Ahora la mano y el destello multiplican la propia materia.
- **Antes**: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/e_board.png` · **después** (P1, pisos 2 · 5 inclinada · 9): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/g_board.png`; detalle de lo alto con los cuerpos nuevos `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/h_f9_p3.png`; en la obra
  (sólo tronc3d + atmos de INT, 6 personas): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/h_obra2.png`. WebGL2 sin errores. `errors: []` en todas.
- **Débil**: el vidrio no refracta (es aditivo; no hay pase de transmisión); los paneles de collage se leen un poco como madera; la base de piedra, bajo la guía,
  sigue algo clara en la obra; falta medir los fps (lo hace QA). Hay más instancias (~3700) y unos 5 ruidos por píxel en la materia sólida.

## T-033 (festa3d de cromo y vidrio): lo que dejo hecho para 3D-BR (pasó a 3D-BR por cambio de plan)
Ticket `tickets/T-033-3DFE-festa-cromo.md` (TURNO ya dice que el próximo número libre es T-034). Respaldos: `parts/festa3d.ARTE2.js.bak` y `res-3d-study/parts/festa3d.json.ARTE2.bak`.
Ya está en `festa3d.js` (es un sumando dentro del colorNode de la placa, justo antes de «light climbs with the resonance»):
- **Cromo**: la placa refleja `room.envMap` (rugosidad 0,18). La normal es **radial** (hacia el eje del ojo, no la del muro), así que no hay corte en las esquinas,
  y el gradiente del campo la dobla (`bend`). El reflejo sólo se ve donde la placa se mueve (`ripple`) y sube con la resonancia. La palma deja un hoyuelo de cromo como una lente.
- **Vidrio**: una retícula romboidal de unos 0,3 m, algo deformada (cristales rotos), con aristas finas que reflejan el entorno y una película fina rosa-oro-turquesa;
  cada cristal recoge un poco de reflejo propio.
- Parámetros `chrome` 0,9, `glass` 1,8 y `bend` 0,35 (en el .json).
- Evidencia (`errors: []`): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/t33c_board.png` (resonancia 0 / 0,6 / 1), `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/t33_obra2.png` (en la obra, 6 personas),
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/festa3d/t33_seam_p3p4.png` (costura continua) y WebGL2 sin errores.
- **Pendiente para 3D-BR**: el reflejo del panel rosa del envMap aparece como manchas grandes (¿bajarlo o teñirlo de oro?); comprobar la banda de la guía a resonancia 1 y
  la coronación con el cromo encima; QA.

## T-032 · colapso y bajada: el API de tronc3d (para 3D-PI › fall3d T-036 y 3D-PO › baixada T-035)
Todo está en el objeto que devuelve la parte (en la obra: `ctx.parts.tronc3d`); en el estudio también en `window.__tronc3d`.
- **Fuera del bloque tronc** (`state.block !== 'tronc'`), la torre conserva los pisos que alcanzó el grupo, sin subida, sin inclinación y sin piso en formación.
  El host tiene que mantener `tronc3d` visible en pom/baixada/fall si quiere verla (INT).
- **`collapse({ mode: 'intent' | 'carregat', duration = 15 })`**: es el guion de fall3d sobre esta torre, reescalado a `duration`. Hasta 1,6 s crece el temblor; entre 1,6 y 2,4 s
  aparece la grieta (un destello en el piso que cede: en intent, a 2/3 de la altura; en carregat, el primer piso).
  **intent**: entre 2,4 y 4 s la torre se inclina hacia un lado; desde los 3 s los pisos se sueltan de arriba hacia la grieta, cada 0,45 s, y sus piezas salen en arco
  hacia ese lado; lo de abajo queda en pie.
  **carregat**: desde los 3 s los pisos se sueltan de abajo arriba, cada 0,3 s, y la torre se hunde en sí misma. Las piezas caen con gravedad, rebotan en lo que sigue en pie
  y se pierden en el vacío. Durante los últimos 2,5 s todo funde a negro.
  Mientras dura, la partitura no mueve la torre. `part.collapsing` → `{ on, t, mode, duration }`. `restore()` lo deshace todo (para los saltos de ensayo).
- **`takeFloor(i, { tower = -1, hide = true })`** devuelve las piezas del piso i tal como están ahora (0 = la base de piedra, 1–9 = los pisos de la partitura), en
  coordenadas del MUNDO: `[{ tower, x, y, z, q: [x,y,z,w], sx, sy, sz (m), r, g, b (lineal), kind ('stone'|'terracotta'|'glaze'|'chrome'|'iron'|'gold'|'light'|'petal'|'glass'|'body'), geo ('box'|'sphere'|'pot'|'tile'|'cone'|'torus'|'glass'|'panel') }]`.
  Con `hide`, tronc3d deja de dibujar ese piso y el que llama lo dibuja desde ese momento. Por ejemplo, la bajada desmonta la torre de arriba abajo:
  `takeFloor(built)`, después `takeFloor(built-1)`… Prueba: el piso 9 da 32 piezas y el 8 da 133 en una torre.
  `giveFloor(i, tower)` vuelve a mostrar el piso.
- **`levels()`** → `[{ tower, built, floors: [{ i, name, y (centro, mundo), h, taken, gone }] }]` por cada torre visible.
- Sonido: `impacts` (los impactos de este frame: `{ wall, u, force }`); el colapso también los emite.
- Evidencia (`errors: []`, WebGPU y WebGL2): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/k_board2.png` (intent a +5 s, a +7,5 s y carregat).
  Nota: con la subida congelada arriba, la caída sale por abajo del cuadro enseguida. Si fall3d quiere verla entera, puede pedirme que la sala baje durante el colapso.

## T-032 · pasada ARTE (notas/ARTE.md) + FALLA de QA corregido
- **FALLA QA (lo perdido no volvía)**: la vuelta de las piezas «perdidas» (st 2) ahora se decide dentro de su rama, antes del `continue`. Con `t032_ret.js` las perdidas
  pasan de 110 a 0 a los 4 s de enderezar la torre, y las libres de 250 a 0 en 6 s (las 11 libres del final las tira la mano virtual del arnés).
- **Barcelona, no primitivas**: base de cascotes de piedra con pavimento de **panot** (la flor de cuatro pétalos en relieve, en el shader) · **façana** con
  persianas (tablillas en el shader, una cerrada y otra abierta con luz dentro), barandilla y contrapeso de ladrillos con una maceta · **banco ondulado de Park Güell** de
  trencadís, contrapesado por una losa de panots y una bola de cromo · **balcón** con macetas y **farol** · **esfera de cromo** con anillo de oro, contrapesada por un
  **rosetón** (anillo de piedra, radios de hierro, vidrio de color) · **macetas** sobre panot con una **escalera de caracol** · **tribuna** del Eixample (vidrio, hierro,
  tejado de zinc, una lámpara dentro), contrapesada por tejas · **gente de puntos** turquesa y coral (la de la Pinya, abrazada por los hombros) · dos **chimeneas de Gaudí**
  retorcidas de trencadís · **pináculo** de bolas esmaltadas con cruz de oro y la luz de la enxaneta. Cada piso mide unos 3 m, está desplazado entre 0,25 y 0,4 del eje
  y lleva el contrapeso al otro lado (escala de la torre 3,0).
- **Teselas**: esquirlas irregulares de 7 lados con bisel: esmalte craquelado en la cara y bizcocho de terracota en el canto y el reverso. Ya no hay hexágonos.
- **Luz**: luz principal cálida (#FFD2A0) y contraluz turquesa (#2ED3C6), sin relleno desde abajo, **sombra de contacto** al pie de cada piso y una **columna de humo**
  detrás de cada torre (turquesa abajo, cálida a media altura). Las **fibras** son un haz de 40 fibras curvas color hueso bajo cada piso.
  La gravedad es de 6,5 m/s² y la restitución de 0,38 (ART §5).
- **Capas**: cerca, 18 piezas de 8–30 cm por muro repartidas en altura (unas 5 a la vista) y un panel lima o cian · en medio, 3 cúmulos por muro a 8–11 m en los
  **cuatro** muros · lejos, 2 **torres de otras colles** en silueta por muro (24–38 m) y 4 nubes de escombros.
- **Encuadre (QA)**: el piso en formación queda a ~5 m (≈ 2,5–3 m en el muro). En el premio las torres se alejan unos 28 m y la sala se pone a media altura de la
  torre, una sola vez, para verla entera; con la salida vuelve a subir.
- **Sonido (ENT › Ola 2)**: snippet pegado. Los rebotes en las cubiertas suenan como `stone/floor`, el deslizamiento como `stone/slide` (≤ 3/s), la mano que golpea un piso
  como `ceramic/hit`, algunas piezas al volver a su sitio como `ceramic/lock` y la grieta del colapso como `stone/hit`. El piso fijado no se duplica: ya suena el `'floor'` del score.
- **Texturas CC0**: no descargué nada. La autorización me llegó a través del director, y yo sólo puedo descargar con el sí de Vicente en mi propio chat.
  Sigo con texturas procedurales. Si se quiere, la descarga puede hacerla el director o Vicente, en `parts/tronc3d/` con un `SOURCES.md`, y yo las conecto.
- **Evidencia** (`errors: []` en WebGPU y WebGL2): tablero P1 (pisos 2 · 5 · 9 · premio) `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/n_board.png`; tiras `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/n_f9_strip.png` (P2/P3 con torres lejanas)
  y `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/n_rew_strip.png`; en la obra (6 personas) `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/n_obra.png`.
- **Débil**: en la obra la fachada clara y las fibras quedan detrás del texto de la guía (pendiente de juicio de ARTE/GUI); en el premio la torre se ve entera pero pequeña y oscura;
  el rosetón y las chimeneas piden más detalle; ~6000 instancias (los fps los mide QA).

## T-032 · ARTE ronda 2: «maqueta blanca» (+ el fallo de `step`)
- **`step is not defined`** (lo vieron GUI e INT): era un estado intermedio entre dos ediciones mías; `step` ya está importado de TSL. Sin errores desde entonces.
- **Estilo**: toda la arquitectura es de yeso hueso mate (#F1ECE2), sin textura ni ruido; la luz hace el trabajo. El color sólo aparece como acento: terracota (macetas,
  ladrillos, tejas), trencadís esmaltado, cromo y neón. Fuera la losa de arena, las losas marrones y las bolas de corcho: los bloques son de yeso y las piezas grandes,
  esquirlas esmaltadas. De la biblioteca CC0 (`scenes3d/assets/cc0/`, sin copiar) sólo uso un mapa: el normal de `sandstone_cracks` para el craquelado de los acentos esmaltados.
- **Luz**: la principal ×2, las sombras casi negras y un filete turquesa fino en cada silueta (la banda rasante del fresnel).
- **Arriba, tan ancho como abajo**: el piso 7 es un corro ancho de 9 personas de puntos; el 8, tres chimeneas de Gaudí de yeso y trencadís; el 9, un **gran rosetón iluminado
  por dentro** (tracería de yeso, vidrio de color) con la cruz y la luz de la enxaneta. El piso 4 se contrapesa ahora con una columna de yeso rota.
- **Las flores son plantas de puntos de luz** (umbelas oro y crema, como los jardines del Pom). Las torres lejanas son sólo siluetas negras con filete.
- **Antes / después**: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/n_board.png` → `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/q_board.png` (pisos 3 · 6 · 9). Con `t032_ret.js` las piezas perdidas vuelven y quedan en 0, y las libres bajan de 914 a 16 en 6 s.
  Colapso en WebGL2 sin errores; obra sin errores. Respaldos: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/tronc3d.T-032-cc0.js` (antes de la maqueta) y `tronc3d.T-032-arte.js`.
- **Débil**: la obra tarda más en estar lista (en la comprobación, más de 6 s): hay ~8000 instancias y el corro de puntos y las plantas son muchas cajitas. Falta medir los fps (QA).
  Si no llega, el primer recorte es el número de puntos por persona y por planta.

## Traspaso de tronc3d.js a TRO-F (24-11)
Desde ahora el archivo es de TRO-F; yo ya no lo toco. Un solo módulo (~990 líneas), `scenes3d/parts/tronc3d.js`, con el .json en `res-3d-study/parts/tronc3d.json`.
- **Arquitectura** (por orden en el archivo): constantes (geometrías `G_*`, materias `K_*`, colores, `TS` = escala de la torre 3,0, `TOWER_D` 6,5 m, `BASE_Y`, `GAP`) ·
  `add()`: **cada pieza es un registro en CPU** (geometría, ranura de instancia, capa 'tower' | 'near' | 'far', torre, piso, casa, cuaternión, escala, materia, color,
  brillo, suelta, grupo, estado de física, `ao`) · `LEVELS` (l. ~101): los 10 pisos (base + 9), cada uno `{ name, h, deck, r, spin, build(T) }`. `T()` escala por TS;
  sus ayudantes son `shard`, `panot`, `plant` y `farol` · `towers` (l. ~251): estado por muro (inclinación como muelle, hundimiento, pisos, marcos) más fibras, cúmulos, humo y paneles ·
  `cluster()` y `kit()`: la jerarquía 1:3:9 · capas cerca, medio y lejos (l. ~309–355) · GPU (l. ~356): **una InstancedBufferGeometry por geometría** (11), con atributos
  por instancia `iP`, `iQ`, `iS` (escala + brillo), `iC` (color + materia) e `iD` (destello, brillo, mano, ao), escritos cada frame. Además, `shardGeometry` y `fibreGeometry` ·
  sombreado TSL (l. ~404): `solidMaterial` hace todas las materias con un If por `K_*`; aparte van vidrio aditivo, humo y paneles *pixel-sort*; el entorno es `room.envMap` más uno procedural.
- **Física** (dentro de `update()`, l. ~658): las piezas sueltas van en el marco de la torre, con la gravedad inclinada (6,5 m/s²); rebotan contra las `deck` de los pisos (restitución 0,38),
  resbalan, se pierden por debajo de y = −7 y vuelven a casa con la torre recta 2 s. `detach()` suelta una pieza o su grupo y `knockTower()` es el golpe de la mano
  (rayo ojo → mano → torre). La subida de la sala es `world.position.y = −rise`, y el retroceso del premio se lleva en `pull`.
- **API** (l. ~908–985, documentada arriba en estas notas): `collapse({ mode, duration })`, `restore()`, `collapsing`, `takeFloor(i, { tower, hide })`, `giveFloor`,
  `levels()`, `impacts` y `rise`; también en `window.__tronc3d`. La usan 3D-PI (fall3d, T-036) y 3D-PO (baixada, T-035). Fuera del bloque tronc, la torre congela sus pisos.
- **Sonido**: el snippet de ENT (`fxImpact`, BroadcastChannel 'ressonancia'). Suenan los rebotes, los deslizamientos, la mano y algún encaje.
- **Costes conocidos**: **~8000 instancias** (los cientos de cajitas de las personas y las plantas de puntos son la mayor parte), todas se recorren en CPU cada frame;
  ~5 ruidos y 1 textura por píxel sólido. La obra tarda **más de 6 s** en estar lista con tronc. Sin fps medidos (QA).
  Primeros recortes: menos puntos por persona (60 + 16 + 10) y por planta (16–26); saltar las piezas ocultas en el bucle; pasar las personas a un solo Points.
- Respaldos en `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/`: `tronc3d.T-032-v1.js`, `-art.js`, `-api.js`, `-arte.js` y `-cc0.js`. El original de la mañana es `parts/tronc3d.ARTE2.js.bak`.

## T-032 vuelve a 3D-FE (después de TRO-F) · ARTE-O ronda 4 (14:50)
Base: la versión de TRO-F (`notas/TRO-F.md`; respaldo de lo que entregó: `parts/tronc3d.TROF-handback.js.bak`). Firma del API sin cambios.
1. **Más ancho, con voladizos**: la placa del collage sale más del eje (centro a ±1,75–2,2 u × 1,7 m) y es más ancha; en el lado opuesto hay un **contrapeso** (bola de cromo
   o bloque de yeso) que alterna de piso a piso, y el neón sale más lejos. Más velo de humo: dos jirones a cada lado de la columna (turquesa abajo, óxido a media altura, ~12–15 %).
2. **Zonas tranquilas en el shader** (`quietK`/`hush`): para cada fragmento busca el muro que lo mira desde el ojo y lo proyecta sobre él. Dentro de la caja del texto (±1,6 m ×
   1,75–2,2 m) o de la columna del botón (±0,9 m × 0,9–1,6 m) la luz se reduce a la mitad y no pasa de ~0,14 lineal (≈ 35 % tras el tono). Se aplica a la materia sólida, el vidrio,
   los paneles y el humo. En la obra, «Mantened la torre recta» queda sobre oscuro.
3. **Torres lejanas**: siluetas negras de bloques en voladizo alterno (sin discos ni bolas), con filo y un punto de luz arriba. **Chimeneas**: terracota que gira en hélice,
   trencadís en todas las filas y un remate que sigue el giro estrechándose. Sin sombreros lila.
- Evidencia (`errors: []`, también en WebGL2): `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/r4_board.png` (pisos 4 · 7 · 9, muro P1) · obra con la guía `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/r4_obra.png` (6 personas, `t032_obra.js`).
- Leído `PLAN-INTERACCION.md` › paso 2 («levantar y nivelar»): no empiezo hasta la aprobación.
- **Débil**: en la obra, al principio (pisos 1–3) la torre sigue estrecha y alta en el cuadro; el voladizo se ve sobre todo de los pisos 4 en adelante. Los pisos bajos quedan muy oscuros (es el `uFall` de TRO-F).

## T-041 · levantar y nivelar — EN PAUSA (orden del director: se retoma con el paso 0 de ENT)
Ticket `tickets/T-041-3DFE-levantar.md` (el número ya estaba reservado en TURNO; el próximo libre sigue siendo T-045). Antes de la pausa ya había un primer
esbozo en `tronc3d.js`, **apagado por defecto** (parámetro `lift`; con `state.yMed` se activaría): la banda de hombros, el piso que sube con las manos, la inclinación por
`yL − yR`, el temblor (`wobble` / `steady` / `slip`) y la caída de un solo piso. **Sin probar visualmente.** Con lift apagado comprobé el camino por defecto: sin errores.
Respaldo de antes del esbozo: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/tronc3d.T-041-before.js`. Al retomarlo: ajustar los nombres a los campos reales de ENT y probarlo.

## T-041 · retomado: la banda de hombros sobre los campos reales (paso 0 de ENT)
- **Activo por defecto**: en la obra se activa en cuanto `state.yMed` existe (se puede apagar con `lift: false`); en el estudio, `lift` es verdadero por defecto.
- **Campos que leo**: `yMed[w]` (la banda la sigue con un muelle rígido, sin retraso añadido; sin manos, espera a 0,95 m, un poco levantada por la frase) y `yL[w]` / `yR[w]`
  (la inclinación, sólo si hay manos en los dos lados). La inclinación de la torre viene del `lean` del score.
  **Lo que espero de ENT** (todavía no está en `score.js`): `state.liftK` (0..1, el ascenso de la frase; mientras no esté, uso `floorProgress`) y los eventos `'wobble'`,
  `'steady'` y `'slip'`; con `'slip'`, `floors` baja en 1 (cae ese piso, no se derrumba la torre). Si ENT les da otros nombres, cambiarlos es una línea en `update()`.
- **Álbum 2**: con lift activo, el piso en formación vive en la **mitad baja** (centro a ~1,4 m en el muro, junto a las manos) y sube con la banda. Arriba quedan los pisos
  ya fijados y el collage.
- **Evidencia** (`errors: []`): estudio (banda inclinada con `level` 0,3 · temblor) `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/l_board.png`; en la obra con el público virtual (6 personas, salto a tronc)
  `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/l_obra.png`: la banda sigue a `yMed` (1,15–1,26 m, junto a los anillos de la guía) en P4 y P1 y está apagada en los muros sin torre. Los pisos suben 0 → 3 con la
  regla vieja del pulso.
- **Falta**: probar con las manos que suben del público virtual cuando ENT publique la regla de la frase; la banda tenue de los muros sin torre; el temblor con los eventos reales.
- **La plaça (hecho)**: en los muros sin torre la banda está al 30 %. Cuando allí se levanta (`state.rise[w]` cruza 0,18 m; en el estudio, cada frase), sale una **corriente de luz**
  por el pie de los muros (a 0,25 m, justo detrás de ellos, 5,5 m/s, por el camino corto, cruzando esquinas y la costura) hasta la torre más cercana: al llegar se encienden su base
  y su banda. Hay un máximo de 6 corrientes a la vez y una pausa de 1,2 s por muro. Comprobado: 2 corrientes a la vez en el estudio, sin errores (`/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/l_plaza_strip.png`: bandas tenues en P2/P3).
  Que cuenten la mitad en la partitura es de ENT. **En espera** de `liftK` y de `wobble` / `steady` / `slip` para la prueba con el público virtual.

## T-041 · conectado a la partitura de ENT (campos reales) — PARADO a la espera
- **Campos que leo**: `band[w]` (la altura de la banda; si no viene, `yMed`); `liftK[w]` (media de los muros de la estructura; se sostiene en `phrase === 'lock'` y se
  reinicia en `'gather'`) → el piso en formación sube con las manos; `yL` / `yR` → la banda se inclina; `lean` → la torre; `wobble` > 0 y `wobbleWall` → **sólo esa torre**
  tiembla, cruje (evento `'wobble'`) y su pie se enciende y late; `'steady'` → golpe grave (hundimiento y destello); `'slip'` (`floors` −1) → cae el piso de arriba con física y se vuelve a
  formar a los 2,6 s; `rise[w]` en los muros sin torre → la corriente de la plaça.
- **Prueba en la obra** (`review.html?from=tronc`, 6 personas, ritmo 2, público virtual que sube): **subir** — fase `rise`, `liftK` 0,58, banda del score 1,07/1,12 m y la mía
  0,97/1,01 m (va un frame por detrás; el score llega por el canal del sonido); **encajar** — fase `lock`, `liftK` 1, piso 0 → 1, banda a 1,39/1,44 m. Sin errores.
  **Inclinar y temblar no los pude provocar en la obra** dentro de los 15 s de la comprobación: el público virtual sube los dos lados por igual, el temblor llega en el piso 7,
  y la partitura la lleva el sonido, así que no puedo forzar `floors` desde la página. En el estudio los dos funcionan (fila 3 de la hoja). Para QA queda un pase largo.
- **Hoja**: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/tronc/lv_sheet.png` (fila 1: subir, obra · fila 2: encajar, obra · fila 3: inclinar y temblar, estudio).
- **Débil**: con 0–1 pisos la torre del Tronc es pequeña y oscura bajo la banda (nota de ARTE pendiente); falta la regla de la mitad en los muros sin torre (es de ENT y ya está).
