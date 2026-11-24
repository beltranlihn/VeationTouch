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
