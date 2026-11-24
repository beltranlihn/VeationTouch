# ENT — notas (T-026, la entrada «umbral»)

## Estado (24-11, 13:05)
Primera versión visible y lista para que INT la ponga en el bloque `wait`. Sin errores de consola en WebGPU ni en WebGL2.
No se ha medido fps (sólo QA).

## Qué hay
### La parte `ressonancia/scenes3d/parts/umbral3d.js` (nueva)
Un umbral de trencadís, 360° continuo, en tres profundidades:
- **Primer plano (0,2–1 m tras cada muro):** 128 teselas colgadas de hilos (cerámica esmaltada: hueso, cobalto, ocre, terracota,
  turquesa, verde, negro; cromo; vidrio iridiscente), a 0,55–2,45 m. Péndulos reales (gravedad, amortiguación, giro sobre el hilo).
  **Interacción física:** una mano que pasa las balancea y las hace girar; una mano que aterriza las golpea y a menudo las
  **descuelga**: caen con gravedad, rebotan en el suelo, se deslizan y se quedan boca arriba; una caída fuerte **las rompe** en 6
  esquirlas. A los 9–16 s (antes cuanto más revelado) las esquirlas se juntan y la tesela **vuelve a subir a su hilo** girando (el
  trencadís: lo roto se recompone). Respuesta en el mismo frame.
- **El suelo:** un trencadís oscuro y esmaltado (≈600 teselas) detrás de los muros que se pierde en lo oscuro, sobre un suelo negro
  brillante que refleja el hilo de brasa.
- **Plano medio (5,8–14 m):** cuatro anillos de esquirlas grandes que giran (cromo, cerámica, vidrio) y cuatro torres de fragmentos
  en las esquinas.
- **Fondo (18–45 m):** destellos lejanos y el **hilo de brasa** en el horizonte con su bruma (ARTE-2 §3, Espera).
- **Movimiento de sala:** el mundo medio y lejano gira alrededor del público a 1,2°/s y respira ±0,25 m (26 s). El primer plano no se
  mueve (es la superficie que se toca).
- **Sin manos:** una racha recorre la banda alrededor de la sala (balanceo que viaja: enseña los 360°) y cada 2,5–5,5 s una tesela se
  mueve sola; a veces cae (con su sonido). Invita a tocar.
- **La revelación:** 30 esquirlas por muro flotan en lo oscuro; con `reveal` vuelan una a una y se encajan en un **anillo de trencadís**
  (r 0,42 m, centro del muro a 1,25 m, 12 cm detrás del plano) alrededor del botón que dibuja GUI (r 0,3). Con `start` el anillo gira
  y se enciende (luz moderada, la banda 0,9–1,6 m sigue legible); con el evento `'start'` **estalla**.
- **Llegada / salida:** las teselas bajan por sus hilos desde arriba, el suelo y los anillos se ensamblan; al irse, los hilos se
  sueltan y todo sube y se aparta girando.
- Materiales físicos (`MeshPhysicalNodeMaterial`: clearcoat, metal, iridiscencia) sobre un **mapa de entorno generado** (paneles de luz
  suaves + el horizonte de brasa) puesto por material, no en la escena (no afecta a otras partes). Sin transmisión (cara en 4 vistas).
- Luces propias: hemisférica, una direccional, 6 de mano (detrás del muro, entre las teselas), 4 del anillo.

### Estudio `res-3d-study/index.html?part=umbral3d` (+ `res-3d-study/parts/umbral3d.json`)
Parámetros: `arrive`, `leave`, `reveal` (−1 = desde las manos, con **la misma regla del score**: la parte corre su propia copia de
`score.js`), `start` (−1 = desde las manos), `motion` (movimiento de sala). Solo, jugando con el ratón o con **G**, el botón se revela,
se pulsa en el centro del muro, estalla y a los 7 s vuelve a la espera.
`window.__study3d.part.debug()` da conteos (teselas cayendo, en reposo, esquirlas, impactos enviados, reveal, start).

### La regla del botón (`score.js`, bloque `wait`; copia idéntica en `ressonancia-sound/score.js`)
- `state.reveal` 0..1: cada mano que aterriza gana 0,035 (máx. 3 por paso), cada mano sostenida 0,01/s (máx. 4 manos); lo ganado entra
  en una «hucha» que paga como mucho 0,055/s (un grupo grande tarda ≥ 18 s: tiempo para ver la sala). Sin manos 6 s, baja (−1/60 por s).
  **Revelado (=1) se queda** mientras haya alguien (hasta 25 s sin manos). Evento `'reveal'`.
- `state.start` 0..1 sólo sube con `reveal >= 1` (1 s después, mientras GUI ensambla el botón) y con manos **sobre el botón**
  (|dx| ≤ 0,55 m del centro de un muro): 3 s con dos manos, 4,5 s con una; baja si se suelta. Al llenarse: `'start'` → intro (como antes).
- `progress` en `wait` sigue siendo `start`. El resto del score no cambia (diff: sólo el bloque `wait`, el estado inicial y `reset`).
- Simulación (`node`, personas virtuales, aleatorio): 2 personas tocando 0,4/s → revelado a 38 s; 1/s → 32 s; 0,2/s → 49 s;
  6 personas → 18 s; 15 → 18 s; nadie en 300 s → 0; dos personas quietas en el centro (el autopiloto de la revisión) → 30 s y empieza a
  los 34 s. Media partida y la sala vacía 30 s: 0,71 → 0,30.
- **Atención GUI/INT:** el anillo de inicio ya no se llena con «2 manos en cualquier sitio»; hace falta `reveal >= 1` y una mano en el
  centro del muro. El autopiloto de la revisión (`res-obra/autopilot.js`) sostiene en el centro: llega a la intro en ~34 s (antes 5 s).
  Si se quiere más rápido para ensayar, que toque en vez de sostener (no es archivo mío).

### Sonido (`ressonancia-sound/`)
- **Voz en español por defecto** (`lang: 'es'` en `manifest.json` y en `sound.js`; el inglés queda en el selector).
- Entrada: el timbal lejano bajo cada mano, más suave; **brillos de vidrio** que se juntan (más y más brillantes) con `reveal`; en
  `'reveal'` un acorde de vidrio que da la vuelta a los muros sobre una respiración grave; mientras se llena `start`, un tono de vidrio
  que sube de re4 a re5 (con su quinta); en `'start'` una ráfaga de teselas y vidrio alrededor de la sala (luego entra el golpe de la intro).
- **Impactos físicos** (canal `fx:impact`, abajo): golpe en tesela colgada = campanita afinada en re mayor pentatónica según la posición;
  caída = chasquido de tesela + cuerpo; rotura = crack + esquirlas; vuelta al hilo = un tic de vidrio. Cerámica / cromo / vidrio con
  parciales distintos. Máx. 14 por segundo, en el muro y la posición del impacto.
- Comprobado en silencio: `check.mjs /sound/ressonancia-sound` → `errors: []`; la parte con `?sound=ressonancia-sound` y 4 manos → sin
  errores; 12 impactos a la vez en P2: medidor de P2 0,022 → 0,134 (los demás muros igual): dentro del margen (≤ 0,35). Nadie lo ha escuchado.

## El canal `fx:impact` (diseño para la ola 2; el lado del sonido ya está hecho)
Mismo `BroadcastChannel('ressonancia')` que el estado. Una parte visual (en la ventana visual) publica:
```js
{ type: 'fx', fx: 'impact', wall: 0..3, u: 0..1 /* a lo largo del muro, vista desde dentro */, strength: 0..1,
  mat: 'ceramic' | 'chrome' | 'glass', kind: 'hit' | 'floor' | 'break' | 'hook' }
```
- La parte abre su propio `new BroadcastChannel('ressonancia')` (lo cierra en `dispose`) y limita a ≤ 16 mensajes/s. El host visual
  ignora los mensajes que no son `state`; el sonido ignora los que no son `ctl`/`fx`. No pasa por el score (no es estado: es efecto).
- El sonido los toca en cualquier bloque (no sólo en `wait`), con su propio tope (14/s) y el mismo reparto por muro que las manos.
- Para la ola 2: si una parte necesita otro timbre, añadir `mat` nuevos (p. ej. `'clay'`, `'fire'`) o `kind` (`'roll'` continuo con
  `strength` = velocidad) — se mapean en `IMPACT_MAT` / `impact()` de `sound.js`. Mientras no existan, caen a cerámica / no suenan.
- Sin el canal (otra app, sin `BroadcastChannel`) no pasa nada: la parte sigue, el sonido sigue.

## Para INT (integración en la obra)
- En `res-obra3d/experience.js › wanted('wait')`: `['umbral3d']` (o `['umbral3d', 'atmos']` si atmos no ensucia: el umbral trae su propio
  horizonte, suelo y luces; yo probaría sin `brasa3d` y sin `atmos`). Añadir `umbral3d` a la lista de partes que se cargan.
- La parte lee `input.state.reveal`, `input.state.start`, `input.events` ('start'), `input.arrive`, `input.leave`, `input.hands`,
  `input.downs`. No mueve la cámara. `dispose()` cierra su canal.
- Coste: ~450 instancias de esquirlas (3 InstancedMesh físicas), ~600 del suelo (1 InstancedMesh, estática salvo al llegar/irse),
  ~420 destellos, 12 luces puntuales/direccionales en los materiales físicos. Si QA ve fps bajos: bajar `mosaic` (celda 0,3 → 0,4) o
  quitar las luces de mano 5–6.

## Para GUI
- El anillo de trencadís de la parte rodea el botón (r 0,42 m a 12 cm tras el muro) en el centro de cada muro a 1,25 m: el botón de
  GUI (r ≈ 0,3) queda dentro, sin solaparse. `reveal` 0→1 es el ensamblaje; `start` 0→1 el llenado; con `reveal < 1` no hay botón.
- La línea de texto de la espera (si la hay) debería invitar a jugar antes que a «poner las manos para empezar»: el botón aparece solo.

## Capturas (primera versión, 13:00)
- `lab/experiments/ressonancia/scenes3d/parts/umbral3d/shots/01-idle-strip.png` — sin manos (la tira de 4 muros).
- `…/shots/02-play-strip.png` — 4 manos virtuales jugando: teselas caídas y rotas, revelación en curso.
- `…/shots/03-revealed-wall-P1.png` — un muro a escala 1 con el botón revelado (`reveal 1`, `start 0,6`): el anillo de trencadís.
- `…/shots/04-webgl2-strip.png` — WebGL2, 4 manos.


## Pasada de arte (pedido del director, 13:00–13:10)
Antes: `parts/umbral3d/shots/before/*.png` · Después: `parts/umbral3d/shots/after-0{1,2,2b,3,4}-*.png` (v1 respaldada en
`parts/umbral3d/umbral3d.v1.js.bak`).
1. **Materia:** teselas gruesas, curvadas (trozo de vasija) y con bisel redondeado de 3 pasos; **dos caras**: esmalte con craquelado
   (mapa normal Voronoi generado) bajo una capa transparente, y **espejo** detrás (y en los cantos rotos); un 15–20 % de **lustre**
   (esmalte iridiscente oscuro) y un 5–10 % de vidrio iridiscente. 7 formas rotas distintas (una InstancedMesh cada una) + giro propio
   de cada pieza: ningún vecino es igual. Reflejan `room.envMap` (INT) si existe; si no, un entorno propio.
2. **Héroe: la cortina cinética** — ~450 teselas en ejes verticales a 1,7 m tras los muros, en un rectángulo desplazado continuo
   (las esquinas y la costura P3|P4 se tocan). **Voltean** (esmalte ↔ espejo) con un muelle (sobrepaso = destello). Sin manos: una
   ola lenta da la vuelta a la sala sin fin (~30 s por vuelta). Cada mano que aterriza lanza una ola desde su punto que corre en los
   dos sentidos (2,6 m/s); las olas se cruzan y **se suman** (dos olas en una tesela = vuelta entera): muchas manos = interferencia.
   Al revelarse el botón, ola desde los cuatro botones; en `'start'`, la ola grande. Ventana oscura detrás de cada botón.
3. **Composición:** la banda colgante pasa a **racimos** (2–4 por muro, 7–13 piezas, las grandes delante) + sueltas; la cortina con
   huecos por un campo de densidad (bloques, vacíos que respiran, se aclara arriba); arcos medios rotos con huecos; piezas grandes
   cerca, pequeñas lejos.
4. **Luz:** llave alta cálida (direccional), **contraluz frío** detrás de cada muro (4 puntuales a 6,5 m), manos y anillo; tres capas
   de bruma aditiva (8,5 / 15 / 27 m) para la profundidad; el **horizonte de brasa es un hilo** (toro de 2,8 cm a 34 m + halo fino);
   el suelo ya no se ilumina de naranja.
Sin errores en WebGPU ni WebGL2 (estudio, solo, 4 manos, revelado). fps sin medir (QA): ahora son ~800 instancias dinámicas en 7
mallas físicas + ~680 del suelo + 16 luces; si cuesta: subir el umbral de la cortina (`keep < 0.53`) o quitar los contraluces.

## Cómo envía `fx:impact` una parte de capítulo (ola 2)
```js
// en create(): un canal propio (el host visual ignora lo que no es 'state'; el sonido toca 'fx')
let bc = null; try { bc = new BroadcastChannel('ressonancia'); } catch { bc = null; }
const msg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };   // un solo objeto: sin asignar por frame
let n = 0, win = 0;
function impact(wall, xFromCentre, strength, mat, kind) {            // xFromCentre: metros desde el centro del muro (+ a la derecha)
  if (!bc || n >= 16) return; n++;                                    // ≤ 16 por segundo (en update: win += dt; if (win > 1) { win = 0; n = 0; })
  msg.wall = wall; msg.u = Math.min(1, Math.max(0, 0.5 + xFromCentre / room.walls[wall].width));
  msg.strength = strength; msg.mat = mat; msg.kind = kind; bc.postMessage(msg);
}
// en dispose(): bc?.close();
```
`kind`: `'hit'` (golpe de mano en un objeto: campanita), `'floor'` (aterriza: chasquido + cuerpo), `'break'` (se rompe: crack +
esquirlas), `'hook'` (vuelve a su sitio: tic). `mat`: `'ceramic' | 'chrome' | 'glass'`. Ejemplo real: `parts/umbral3d.js › fx()`.

## Sonido: el golpe de las teselas en cada transición (pedido del director)
`sound.js › tileSweep(b)`: en cada cambio de bloque, un barrido de ruido filtrado sube alrededor de los muros hasta el **pico de las
teselas** de INT (0,15 s + la mitad de `MOVES[b].dur`, ÷ `pace`: 1,45 s en `fall` … 2,25 s en intro/baixada), y en el pico un clac de
tesela y un destello de vidrio por muro y un golpe grave suave. Más bajo donde la música ya golpea (crown 0,45, festa 0,6, fall 0,6).
Si INT cambia `MOVES`, hay que copiar las duraciones a `TILE_DUR`. Silencioso: saltos wait→intro→pom sin errores; pico de muros 0,21
(con la voz del título). Nadie lo ha escuchado.


## Ola 2 — el sonido de cada interacción física (13:10) · snippet para los dueños de las partes
Traspaso: desde ahora `umbral3d.js` (+ carpeta, .json) es de ENT-F. ENT sigue con `score.js` (+ copia) y `ressonancia-sound/`.

**Lado del sonido (hecho, `sound.js › impact()`):** cada materia con su timbre, afinada al modo del capítulo (brasa, pinya, tronc,
fall: re menor pentatónica; los demás: re mayor pentatónica), posición en el muro → grado, fuerza → nivel. Tope 14/s en total, y cada
muro lleva una carga que decae en 0,35 s (compartida con las manos): una ráfaga en un muro no se amontona.
| mat | dónde | kinds que suenan |
|---|---|---|
| `fire` | brasa: teselas ardiendo | `splash` (gota de metal que cae + siseo), `ignite` (estallido de brasa + aliento grave), `sink` (se hunde: glissando al sub), `hit` |
| `chrome` | brasa: el líquido; umbral | `splash`, `hit`, `floor` |
| `wire` | pinya: cubos de alambre | `floor` (tic metálico fino + cuerpo), `lock` (vuelven a su sitio), `hit` |
| `ceramic` | pinya (teselas esmaltadas), tronc, umbral | `floor`, `lock`, `break`, `hit`, `hook` |
| `stone` | tronc: piezas del ensamblaje | `floor` (cerámica grave + piedra), `slide` (raspado, fuerza = velocidad; ≤ 1 por muro cada 0,15 s), `lock`, `hit` |
| `line` | pom: teselas de línea | `hit` (al soltarse: vidrio alto), `floor` (lejos, abajo en el cañón: un tic con mucha reverberación) |
| `petal` | pom: jardines | `bloom` (arpegio de vidrio suave que sube) |
| `glass` | umbral | `hit`, `floor`, `hook` |
Prueba silenciosa (ráfaga de 9–12 impactos a fuerza 1 en un muro, por capítulo): picos de muro ≤ 0,25 (límite 0,35), sub ≤ 0,21; sin errores.

**Snippet común (pegar una vez en `create()` de la parte; sin asignar memoria por frame):**
```js
// ---- sound (wave 2): physical impacts to the sound piece (ressonancia-sound › impact()) on the work's BroadcastChannel; ≤ 16 a second
let fxBc = null; try { fxBc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ressonancia') : null; } catch { fxBc = null; }
const fxMsg = { type: 'fx', fx: 'impact', wall: 0, u: 0.5, strength: 0, mat: 'ceramic', kind: 'hit' };
let fxN = 0, fxT = 0;
function fxImpact(wall, u, strength, mat, kind) {                // wall: room.walls index · u: 0..1 along it · strength: 0..1
  if (!fxBc || fxN >= 16) return; fxN++;
  fxMsg.wall = wall; fxMsg.u = u < 0 ? 0 : u > 1 ? 1 : u; fxMsg.strength = strength < 0 ? 0 : strength > 1 ? 1 : strength; fxMsg.mat = mat; fxMsg.kind = kind;
  try { fxBc.postMessage(fxMsg); } catch { /* closed: play on */ }
}
function fxAt(p, strength, mat, kind) {                         // the same from a world point (the wall it is seen through from the eye)
  const W = room.walls, e = room.eye, dx = p.x - e.x, dz = p.z - e.z; let wi = 0, best = -Infinity;
  for (let i = 0; i < W.length; i++) { const k = -(dx * W[i].normal.x + dz * W[i].normal.z); if (k > best) { best = k; wi = i; } }
  const w = W[wi], de = (w.centre.x - e.x) * w.normal.x + (w.centre.z - e.z) * w.normal.z, t = best > 1e-6 ? -de / best : 0;
  fxImpact(wi, 0.5 + ((e.x + dx * t - w.centre.x) * w.right.x + (e.z + dz * t - w.centre.z) * w.right.z) / w.width, strength, mat, kind);
}
// in update(dt, input):  fxT += dt; if (fxT > 1) { fxT = 0; fxN = 0; }
// in dispose():          try { fxBc?.close(); } catch { /* closed */ }
```
**Llamadas por parte** (donde ya ocurre el evento físico; `p` = posición mundo del objeto, `v` = su velocidad):
- **brasa3d (3D-BR):** tesela ardiendo que toca el cromo líquido → `fxAt(p, Math.min(1, Math.abs(v.y) / 6), 'fire', 'splash')`;
  cuando prende → `fxAt(p, 0.6, 'fire', 'ignite')`; cuando se hunde → `fxAt(p, 0.5, 'fire', 'sink')`. Si la mano salpica el líquido
  ya suena la mano: no enviar.
- **pinya3d (3D-PI):** recorrer su `impacts` de cada frame (ya calculado, `{ wall, u, force }`, sólo > 1,2 m/s) →
  `for (const i of impacts) fxImpact(i.wall, i.u, Math.min(1, (i.force - 1.2) / 4), cubeIsWire ? 'wire' : 'ceramic', 'floor')`;
  cuando un cubo vuelve y encaja → `fxAt(p, 0.4, 'wire', 'lock')`.
- **pom3d (3D-PO):** una tesela de línea que la mano suelta → `fxAt(p, 0.4, 'line', 'hit')`; si se simula su llegada abajo →
  `fxAt(p, 0.3, 'line', 'floor')`; un jardín que florece → `fxAt(p, bloomSize, 'petal', 'bloom')` (como mucho uno por jardín cada 2 s).
- **tronc3d (3D-FE):** su `impacts` `{ wall, u, force }` → `fxImpact(i.wall, i.u, Math.min(1, i.force / 5), 'stone', 'floor')`;
  piezas deslizándose → `fxAt(p, Math.min(1, speed / 2), 'stone', 'slide')` (≤ 3/s); la mano que golpea un piso →
  `fxImpact(wall, u, 0.7, 'ceramic', 'hit')`; una pieza que encaja en su sitio → `fxAt(p, 0.5, 'ceramic', 'lock')`. El piso fijado ya
  suena por el evento `'floor'` del score: no duplicar.


## Sonido de los movimientos de sala (13:12) — `sound.js › follow()`, «the room movements»
El sonido corre el score: cada capa sigue el estado que mueve a la parte (no lee las partes).
- **Brasa — la sala se hunde en el cromo líquido** (brasa3d: `lift` ∝ el nivel del anillo, ≤ 3 cm/s): un batido viscoso (ruido en
  banda 300–560 Hz que respira) y su cuerpo en el sub, ∝ `progress`; burbujas lentas (una gota de metal grave) cada vez más frecuentes.
- **Pinya — gira con la rotllana** (pinya3d: al cerrarse el círculo, ≤ 3°/s, se para suave en el premio): un roce suave de cuerpos
  que da la vuelta a los muros (rotor), desde `closed = 1`, se apaga en ~7 s del premio.
- **Tronc — el ascensor junto a la torre** (tronc3d: sigue al piso en formación, ≤ 0,35 m/s): un roce grave de piedra y una quinta
  baja (re1–la1) ∝ la velocidad de subida (`floors + floorProgress`, suavizada), más aguda cuanto más alto. En el premio se corta en
  seco con el resto de la música (el corte del Tronc sigue intacto).
- **Pom — 1,6 → 90 m con giro de 45°** (pom3d: altura = muelle sobre el `climb` del score): **el zumbido de la ciudad se aleja**
  (ruido grave + re/la graves, que bajan y se cierran con la altura, (1 − progreso)^1,6) y **el aire fino de la altura se abre**
  (ruido en banda 2,2 → 7,2 kHz, ∝ progreso) en el rotor del viento; el campo del viento **gira 45° con el mundo** a lo largo de la
  subida. Sigue el hilo que sube re5 → re6, las ráfagas de cada escalador y el `m-pom`.
Prueba silenciosa (saltos a ritmo 8, sin manos): sin errores; picos de muro 0,18–0,25; sub brasa 0,16 · pinya 0,27 · tronc 0,63
(como antes: pulso + bajo a ritmo alto) · pom 0,37 (incluye el golpe de la transición de teselas). Nadie lo ha escuchado.

## Voz en español ↔ textos en los muros (GUI) — revisión 13:12 (sin regenerar nada)
Coinciden: intro (título «Poned las manos sobre el muro» = v-intro-6; lema Fuerza/Equilibrio/Valor/Seny = v-intro-5), Brasa
(«Tocad el muro», «Ahora, todos a la vez» = v-brasa-1/2), Pinya («Buscad un círculo y sostenedlo», «El círculo se ha cerrado» =
v-pinya-1/3), Tronc («Mantened la torre recta · los dos lados» = v-tronc-2; «Tocad al ritmo del tambor» ≈ v-tronc-1 «Escuchad el
tambor y tocad a su ritmo»), Pom («Quietos. Llevad su luz» = v-pom-2), corona («Coronado» = v-aleta-1), festa («La plaza es vuestra»
= v-aleta-2), acta (las tres glosas y la frase final = v-cierre-*).
**Desajustes:**
1. **Espera — el concepto cambió y ni la voz ni el muro lo dicen.** Muro (guide3d) «Poned las manos sobre el muro / para empezar» y voz
   v-wait «Poned las manos sobre el muro para empezar.»: con la regla nueva poner las manos no empieza; primero se juega y aparece el
   botón. Propuesta (muro y voz iguales): antes de revelar «Tocad. Jugad con la sala.»; revelado «Sostened el anillo para empezar». La
   voz v-wait habría que regenerarla (o callarla en `wait` hasta entonces: decisión del director).
2. **Bajada — verbo distinto.** Muro «Quedaos. Bajadlo / piso a piso»; voz v-baixada-1 «… Seny. Acompañadlo, piso a piso.» Propuesta:
   muro «Acompañadlo / piso a piso» (cambio de GUI, sin tocar la voz). «Bajadlo» además sugiere una acción que no es la del juego
   (seguir sosteniendo).
3. Menores (no hace falta cambiar): v-brasa-3 «Otra vez. Juntos.» no tiene texto propio (el muro sigue con «Ahora, todos a la vez ·
   n de 3»); v-tronc-3 «Juntos. Al ritmo.» tampoco; la caída («Ha caído / Quedan las brasas») no tiene voz en el bloque `fall` (la voz
   del desenlace llega en el acta, que coincide); v-intro-5 dice «Y seny» (el muro, «Seny»).


## Voz de la espera (13:15)
- El viejo `v-wait` está **en silencio** (`sound.js`: ya no está en la lista de voces ni se dice).
- Ya están conectadas, detrás de `WAIT_VOICES = false` (para no pedir archivos que aún no existen): `v-wait-invite` (antes de revelar,
  sala vacía tras haber manos, como mucho cada 40 s) y `v-wait-start` (1,4 s después de `'reveal'`). Cuando existan
  `audio/v-wait-*.mp3` y `audio/es/v-wait-*.mp3`, se pone `WAIT_VOICES = true`.
- **Grabadas (13:18, con el sí de Vicente transmitido por el director: «Sí, grábalas»):** 4 archivos, mismas voces, modelo
  (eleven_v4), ajustes (0,5 / 0,8) y etiqueta `[softly]` que el resto. Comprobadas con speech-to-text (scribe_v1), ninguna etiqueta
  se pronuncia: ES «Tocad, jugad con la sala» (2,40 s) · «Sostened el anillo para empezar» (2,32 s); EN «Touch. Play with the room»
  (2,48 s) · «Hold the ring to begin» (2,00 s). `audio/v-wait-{invite,start}.mp3` y `audio/es/…`; registro en los JSON de voces.
  `WAIT_VOICES = true`; carga sin errores en ES y EN. La clave no se ha impreso ni escrito en el repo. Nadie las ha escuchado.
- La bajada en el muro ya dice «Acompañadlo / piso a piso» (GUI): coincide con la voz.


## Sonido de los capítulos rehechos (13:22, antes de que lleguen las partes)
Tickets leídos: T-033 (festa de cromo y vidrio; desde la tarde es de **3D-BR**, 3D-FE hizo una primera capa). **T-035 y T-036 aún no existen en
`tickets/`**: diseñado desde el mensaje del director (bajada al amanecer con lluvia de vidrio y flores; caída = colapso físico de la
torre-ensamblaje vía `tronc3d.collapse`). Todo en `sound.js` («colours of the re-made chapters» + `impact()`); suena aunque las partes
no envíen nada.
- **Festa (cromo y vidrio):** un brillo de armónica de vidrio en re mayor (re5 fa#5 la5 re6, senos desafinados) que crece y se abre con
  `resonance`, en el rotor rápido del oboe granular. Las manos siguen con su golpe FM afinado.
- **Bajada al amanecer — más luz, mayor, aire:** un pad abierto de re (add9: re4 la4 mi5 fa#5 la5, triángulos con filtro que se abre
  1,2 → 3,6 kHz) que entra con la bajada (0,3 → 1 con el progreso) y se queda medio en los primeros 8 s del acta, + el aire de la mañana
  (ruido 5,2 kHz en el rotor de la lluvia). `m-baixada` y la lluvia siguen. Vidrio que cae al suelo: `glass/floor` = tic de vidrio alto
  (sin clac de cerámica); flor que crece: `petal/bloom` (arpegio de vidrio).
- **Pom — la bruma dorada (p ≈ 0,55–0,65):** un acorde de oro agudo (re6 fa#6 la6 re7) y un aliento brillante en el rotor del viento,
  campana gaussiana centrada en progreso 0,60 (σ 0,06). Si 3D-PO pone la bruma en otro tramo, que me diga el centro.
- **Caída (colapso):** un estruendo grave que muere en ~6 s (sub + banda 260 Hz) bajo los golpes de siempre; los escombros vienen de
  los impactos de la parte (`stone`, a 0,3 de nivel dentro de `fall` para quedar debajo del golpe). Golpe de la transición en `fall`
  bajado (0,6 → 0,3) y el sub del golpe grave de la caída 0,9 → 0,7.
Prueba silenciosa (saltos, impactos sintéticos): festa 0,34 / sub 0,11 · baixada 0,19 / 0,12 · fall con 12 impactos de piedra
0,34 / 0,64 (antes de mis cambios la caída sola ya daba 0,33 / 0,68); sin errores. Nadie lo ha escuchado.

**Llamadas para cada dueño** (con el snippet común de arriba, «Ola 2», `fxImpact` / `fxAt`):
- **festa3d (3D-BR, T-033):** nada obligatorio (las manos ya suenan). Opcional: cuando una tesela de vidrio se enciende por un golpe de
  resonancia fuerte → `fxAt(p, k, 'glass', 'hit')` (≤ 4/s; `k` = su brillo 0..1).
- **baixada3d (3D-PO, T-035):** una esquirla que la mano recoge → `fxAt(p, 0.5, 'glass', 'hit')`; una flor que crece donde la mano
  la recoge → `fxAt(p, Math.min(1, size), 'petal', 'bloom')` (≤ 1 por flor); esquirlas que tocan el suelo → `fxAt(p, Math.min(1, speed / 6), 'glass', 'floor')`
  (≤ 4/s, sólo las cercanas: < 3 m tras el muro).
- **tronc3d.collapse / fall (3D-PI, T-036):** cada pieza que golpea → `fxImpact(i.wall, i.u, Math.min(1, i.force / 6), 'stone', 'floor')`
  (desde su `impacts`); un piso que se parte → `fxAt(p, 0.9, 'stone', 'break')`; teselas de cerámica que se rompen → `fxAt(p, k, 'ceramic', 'break')`
  (≤ 3/s). El tope de 16/s del snippet basta: el sonido no pasa de 14/s y reparte la carga por muro.
- **pom3d (3D-PO):** la bruma no necesita mensaje (va por el progreso del score); los jardines siguen con `petal/bloom`.


## La rotura de la intro → el desgarro (13:30; INT T-034)
La plaza ya no se rompe en paneles: INT la **rasga en losas de imagen de 46,3 a 57,8 s**. El sonido (`sound.js`, «the intro's TEAR»):
a los 46,3 s un crack (`s-crack` a 0,8) y una caída grave al sub; durante el desgarro, un **rasgado** de ruido en banda que vaga
(0,5–3,2 kHz) con envolvente que sube en 1,2 s, se sostiene hasta ~51,8 s y **se adelgaza bajo el lema** (voz a 53,3 s); **clacs de
losa y destellos de vidrio** que corren por los muros desde P4 en los dos sentidos (densidad máxima ~48,5 s, la mitad de la sala a
0,42 de la duración, como la ola de INT); a los 57,8 s la última losa se asienta: un destello de vidrio por muro (el título). Las
campanas graves pasan de 46 a 46,3 s. Las voces de la intro no cambian (8,5 / 17 / 29 / 41 / 53,3 / 66,3 s). Prueba silenciosa:
46–50 s picos de muro 0,23–0,27, sub 0,17; sin errores. Nadie lo ha escuchado.


## Densidad de impactos — la entrada nueva (13:40)
ENT-F suelta ~9 piezas por toque (13 en roseta, 14 en cadena): el canal va al tope. `impact()` ahora: (1) **racimos** — los impactos
`floor`/`hit`/`hook` que llegan a un muro < 90 ms después del último que sonó allí no abren voz ni clac: añaden un tic pequeño
(una octava arriba) a esa voz (≤ 8 por racimo); (2) **densidad** — un contador de impactos del último segundo baja el nivel de cada
uno (1/√(1 + tasa/4): ~0,45 a 16/s), el clac de tesela se vuelve raro y el cuerpo grave desaparece cuando llueve; (3) **tamaño** —
grado al azar entre tres vecinos y octava por tamaño (grande −12, pequeño +12); si la parte manda `size` (metros) en el mensaje se
usa ese. Tope de entrada 14 → 20/s (los tics de racimo son baratos). Prueba silenciosa: ráfagas de 9 cada 0,3 s durante 5 s → muros
≤ 0,06, sub 0,11, sin errores: una lluvia por debajo de las manos. Para ENT-F (opcional): añadir `size` al mensaje.


## umbral3d vuelve a ENT (14:28) — retoques del director de arte
- Ya estaban en la versión de ENT-F: clave del arco a 1,95 m con la frase como dintel a 2,12 m (`DOOR_H`, zona de palabras) y jamba de
  teselas de oro rotas e irregulares. Sin tocar.
- **Faro limitado cerca de los muros** (lo único que cambié): conos 0,72 → 0,5 rad y 0,8 → 0,55 rad, intensidades 1,45 → 1,25 y 1,1 → 0,8.
  El parche blanco que el haz dejaba en el mosaico cercano desaparece (píxeles quemados de la tira 0,21 % → 0,11 %; luminancia media
  38 → 33). Respaldo `parts/umbral3d/umbral3d.ENTF.js.bak`; captura `parts/umbral3d/shots/e-lighthouse-capped.png`. Sin errores
  WebGPU/WebGL2. fps: QA (no cambia el número de luces).


## T-038 / T-039 — entradas nuevas y l’aleta (14:37) · ticket `tickets/T-038-ENT-entradas.md`
**Paso 0 (score.js, las dos copias idénticas; respaldo `score.INTERAC.bak`):**
- `step(dt, hands)`: mano `{ stroke, wall, dx, y, vx, vy, size, s, speed }` (sólo stroke/wall/dx obligatorios). Estado nuevo: `yMed[w]`,
  `yL[w]`, `yR[w]`, `span[w]`, `rise[w]` (0 sin manos), `strokes[]` (por mano: `stroke, wall, y, y0, rise, disp`), `learned{}`, `assist`,
  `aletaHands`, `aletaWidth`. Línea base `y0`: la altura al posarse, que sigue a la mano con τ 6 s. `disp`: media de los últimos 0,25 s
  contra media de hace 0,75–1,25 s. `TIMES.hand = { size: 0.12, base: 6, span: 2 }`.
- Pom: `restless` = alguna mano con `disp` > `TIMES.pom.still` (0,15 m); `stillSpeed` queda sin uso.
- **Arreglo (bug que ya estaba):** el abandono (45 s sin manos) contaba desde la intro: tras los 70 s de intro sin tocar, la Brasa
  abandonaba al entrar y la obra volvía a la espera (pasaba igual con la partitura vieja y el público virtual). Ahora el contador se pone
  a 0 en cada cambio de bloque.
- `sound.js` arma la mano completa desde `vt.hands()` (`y = v × altura`, `size` del runtime, `s` desde el inicio de su muro, `vx/vy`).
- **Pruebas:** (a) pase completo con el público virtual (réplica en node de `autopilot.js`), partitura vieja (con el mismo arreglo) contra
  la nueva, 2/6/15 personas: **duraciones de bloque idénticas (0,00 %)**; con el público que alza la mano en l'aleta, Pom +1,6–1,8 s
  (2,5 %), lo demás igual. (b) Arnés, sonido real: manos fijas a 1,10 / 1,75 / 0,62 m → `yMed` 1,100 / 1,750 / 0,620 (error 0,0 cm); una
  mano que sube 0,45 m en 1,2 s → rise 0,40, disp 0,32. (c) Pom con temblor ±3 cm a 10 Hz: **0 % inquieto** (la partitura vieja: 25 %);
  con movimiento real: 98 % (vieja: 66 %). Scripts en el scratchpad `ent/t038/` (equiv, pomtest, aleta).
- Público virtual (`res-obra/autopilot.js`, respaldo `.INTERAC.js.bak`): `slideY` (subir/bajar a ritmo humano), `gatherDx` (juntarse al
  centro), `raiseOne` (una mano sube 0,3–0,6 m a 0,3–0,45 m/s, la otra se queda); lo usa en l'aleta. El resto, igual que hoy.

**Paso 1 (l'aleta):** fase `aleta` del bloque `pom` tras el premio (`TIMES.aleta = { window: 8, rise: 0.28, high: 1.6, quorum: 0.6, within: 2 }`);
eventos `'aleta'` y luego `'crown'` (como siempre). Pruebas (node): manos quietas → corona a 7,98 s, `aletaWidth` 0,15; manos que suben
(6 o 15) → a 1,8 s, 0,65; una persona → 2,1 s, 0,89; sin `y` (anfitrión viejo) → 7,98 s, 0,15. Arnés con sonido: tres muros suben →
corona a 1,1 s de abrirse la ventana, ancho 0,73, sin errores; picos de muro ≤ 0,30, sub 0,50 (la coronación, como antes).
Sonido: la subida (ruido en banda 0,3 → 4 kHz y un diente de sierra re3 → re4) bajo la ventana; al disparo se corta en 30 ms y entra
`m-crown` en su golpe; los destellos de vidrio crecen con `aletaWidth`. `m-crown` ya no arranca en el premio del Pom.

**Para el director (relevar):**
- **GUI:** en la fase `aleta` del Pom `guide3d › lines()` sigue diciendo «Quietos. Llevad su luz»: debería callar o invitar a alzar la
  mano («Levantad la mano», o nada si va la voz). **Voces** (paso 5): «Ella levanta la mano.» … «Levantad la vuestra.» no existen aún;
  hoy `v-aleta-1` («Levanta la mano. El castell está coronado.») suena 2,2 s después de coronar.
- **3D-PO (pom3d) / 3D-BR (festa3d):** pueden leer `state.phase === 'aleta'` (la silueta de la enxaneta alza la mano), `state.strokes`
  (qué manos subieron: `rise`) y `aletaWidth` en la coronación (rayos de oro más anchos).
- **INT (T-040):** el anfitrión debe pasar `y` (m, desde el suelo), `vx`, `vy`, `size`, `s` en `scoreHands` (`experience.js`, `shPool`).
  Mientras el sonido lleve la partitura (lo normal), el estado ya llega con todo; sin sonido, sin `y`, l'aleta corona siempre a los 8 s.
- **Texto para PARTS.md (INT):**
  > `input.state` adds (24-11, plan step 0): per wall `yMed[w]`, `yL[w]`, `yR[w]` (median hand height, m: all / left of the centre /
  > right), `span[w]` (total hand width in the densest 2 m), `rise[w]` (mean rise above the hands' baselines, m) — 0 when the wall has no
  > hands; `strokes[]` = per hand `{ stroke, wall, y, y0 (baseline: its height when it landed, following it with τ 6 s), rise, disp (m moved
  > in the last 1 s, filtered) }`; `learned{}` and `assist` (0..1) for the later steps; l'aleta: phase `'aleta'` of block `pom` (8 s
  > window after the reward), `aletaHands` (share of hands that rose) and `aletaWidth` (0..1), event `'aleta'` just before `'crown'`.
  > The host passes the score `{ stroke, wall, dx, y, vx, vy, size, s, speed }` per hand (metres, y from the floor).


## T-041 · Tronc = levantar y nivelar · Bajada = bajar — CAMPOS DEL ESTADO (para 3D-FE, 14:45; el código llega detrás)
Todo en `input.state` (y en el `state` del canal). Alturas en metros desde el suelo. Por muro = arrays de 4.
**Tronc** (`block === 'tronc'`, fase `play`):
- `phrase`: `'gather' | 'rise' | 'lock'` — la frase de 4,8 s (`TIMES.tronc.phrase`): reunir 0–1,2 s (las manos bajan a recibir),
  subir 1,2–3,6 s, encajar 3,6–4,8 s. `phraseT` 0..1 dentro de la frase. `beat` / evento `'pulse'` siguen (reloj musical, 2,4 s).
- `band[w]`: altura de «los hombros» (la banda) en cada muro: sigue la mediana de las manos (`yMed`) al subir, se queda al encajar;
  0,9 m sin manos. `liftK[w]` 0..1: cuánto ha subido el muro en esta frase (mediana de subida / 0,33 m).
- `lifters[w]`, `bases[w]`: manos que suben / manos quietas abajo (la base: dan estabilidad) en esta frase.
- `lean[w]` (−1..1, como antes) ahora sale de `yR − yL` de la torre (o del lado sin manos); `level`: true si todas las torres van
  rectas; `balance` (desde el 3.er piso) como antes. `floors`, `floorProgress`, `weak[w]` como antes.
- **Temblor:** `wobble` 0..1 (progreso de los 5 s; 0 = no hay), `wobbleWall` (muro de la torre que tiembla, −1 si no). Pide manos
  abajo junto al pie (y < 0,95 m) en ese muro.
- Eventos: `'lift'` (una frase bien subida), `'floor'`, `'level'` (encaje con todas rectas) / `'balance'` (alguna torcida, como antes),
  `'wobble'`, `'steady'` (se asienta), `'slip'` (pierde un piso), `'pulse'`, `'weak'`, `hint:lift`, `hint:straight`, `hint:foot`.
**Bajada** (`block === 'baixada'`):
- `lowerK` 0..1: progreso del descenso actual (mediana de lo que han bajado las manos desde su punto más alto / 0,5 m).
- `band[w]`: la banda arriba, con las manos (mediana) mientras bajan. `descents`: descensos hechos; `dropped`: soltados seguidos.
- Eventos: `'lower'` (un descenso completo: bajan 2 pisos, cada uno con su `'down'`), `'down'`, `'crack'` (brusco > 0,4 m/s o soltado),
  `'fall'` (carregat: tres soltados seguidos, o la sala vacía como antes).
- Por mano, en `strokes[]`, se añade `dy` (m de subida/bajada en el último segundo, con signo).


## T-041 hecho (14:43) — Tronc levantar/nivelar · Bajada bajar (score.js ×2 idénticos; respaldos `score.T041.bak`)
- `TIMES.tronc = { min 85, target 115, max 145, reward 6, period 2.4, phrase 4.8, rise 0.33, wobble 5, foot 0.95, gain 0.72, help 0.5 }`;
  `TIMES.baixada = { min 30, target 40, max 50, empty 6, lower 0.5, gentle 0.4, net 12, drop 3 }`. Campos y eventos: la sección
  «CAMPOS DEL ESTADO» de arriba (todos implementados con esos nombres). `equilibri` = parte de los encajes con todas las torres rectas.
- **Pruebas (node, `scratchpad/ent/t038/tronc.mjs`, `baix.mjs`, `full.mjs`):** Tronc — manos quietas: 1 piso a los 60 s, 5 al final
  (145 s, con la ayuda); manos que suben: 6 a los 60 s, 8 (dos temblores sin asentar: dos resbalones); subiendo y llevando manos al pie
  en el temblor: 9 pisos a los 104 s (steady ×2); un solo lado sube: |lean| 1,0, 20 encajes torcidos, menos pisos. Bajada — quietas: el
  primer piso baja a los 39,4 s (la red), acaba a 47,9 s; bajando suave: primer piso a 3,2 s, 6 descensos, 0 crujidos, acaba a 35,7 s;
  brusco: 5 crujidos; soltando a mitad: 3 crujidos → *carregat* a los 15,2 s. Pase completo con el público virtual nuevo: Tronc
  121–128 s, bajada 33 s, 7–8 pisos, descarregat; el pase dura ~9:20.
- Público virtual (`autopilot.js`): en el Tronc baja a recibir y sube 0,5 m a 0,38 m/s cada frase (el «sloppy» se queda de base); en
  el temblor lleva las manos al pie; en la bajada sube a recibir y baja 0,75 m a 0,3 m/s cada 6,5 s.
- Sonido: al empezar la subida de cada frase, una línea de cerámica que sube por los muros de la torre (re menor pentatónica) y un
  aliento; `lift` acorde de cerámica; `level` un vidrio; `wobble`: la música cae a 0,12, crujido y retumbo (el crujido de la
  inclinación sigue al `lean`); `steady` golpe grave de alivio y vuelve la música; `slip` crujido y teselas que resbalan. Bajada:
  `lower` tríada de vidrio que cae + grave suave; `crack` crujido + esquirlas. Prueba silenciosa en el arnés (manos guionizadas):
  Tronc picos 0,29–0,30 / sub 0,58; bajada 0,28–0,32 / 0,12; sin errores. Obra 3D y review sin errores.
- Para GUI: el Tronc ya no se juega pulsando al ritmo: «Tocad al ritmo del tambor» debe pasar a una invitación a levantar
  (propuesta: «Levantad» / «Subidlo juntos»); la bajada, «Acompañadlo / piso a piso» sigue valiendo. Sin contadores (paso 5).


## T-042 · Pinya = juntarse — CAMPOS DEL ESTADO (para 3D-PI, 14:47; el código llega detrás)
`block === 'pinya'`, fase `play`:
- `pinyaStage`: `'palm'` (0–15 s del juego: palma con palma) → `'pack'` (las figuras van al centro del muro y las manos las siguen).
- `pack[w]` 0..1: lo apretadas que están las manos de cada muro = (anchura de manos en la ventana de 2 m más densa, `span[w]`, frente a
  la que toca por grupo) × (parte de las manos del muro que caben en esa ventana). `packed[w]` true con `pack ≥ 0,9` (con histéresis).
- `packX[w]`: el centro (m desde el centro del muro, `dx`) de esa ventana más densa: hacia dónde se aprieta la gente.
- `fill[w]` 0..1 (como antes) ahora crece con lo apretado (`pack`), no con el tiempo; baja despacio si se separan. `closed`, `walls`,
  `structure`, `needWalls`, `buttons` como antes.
- `assist` 0..1: desde los 40 s de juego la multitud de luz cierra el hueco por el grupo (la red).
- Eventos: `'palm'` (una mano se posa: ≤ 1 cada 0,3 s), `'pack:w'` (el muro w se ha apretado), `'wall:w'` (lleno, como antes),
  `'close'` (como antes), `'learned:pinya'`.
- `learned` (para que el anillo de GUI se disuelva): `learned.pinya` (≥ la mitad de las manos apretadas), `learned.tronc` (la primera
  frase bien subida), `learned.pom` (4 s de luz subiendo sin inquietud), `learned.aleta` (≥ la mitad de las manos alzadas al coronar),
  `learned.baixada` (el primer descenso completo). Cada uno emite `'learned:x'` una vez por pase.


## T-042 hecho (14:53) — Pinya juntarse + `learned{}` (score.js ×2 idénticos; respaldos `score.T042.bak`)
- `TIMES.pinya = { min 50, target 75, max 100, reward 8, fill 10, hold 3, palm 15, pack [0.55, 0.9], perHand 0.6, net 40 }`. Campos y
  eventos: la sección «T-042 … CAMPOS DEL ESTADO» (implementados con esos nombres). Esperado por muro = (personas / muros necesarios)
  × 1,6 manos × 0,12 m × 0,6 (mínimo dos manos); `pack = min(1, span / esperado) × concentración` (concentración = parte de la anchura
  del muro dentro de su ventana de 2 m: 0 por debajo de 0,5, 1 desde 0,85). Una persona sola con una mano no aprieta su muro (pide dos manos).
- **Pruebas (node, `t038/pinya.mjs`):** apretadas (2, 6 y 15 personas) → se cierra a los 50 s y `learned.pinya` al empezar; separadas
  (manos a 2,2 m, o repartidas por el muro) → sólo con la red, a los 70,7 s, sin `learned`; separadas que siguen a la palma hacia el
  centro → a los 50 s, `learned` a los 27 s. Pase completo con el público virtual: Pinya 58 s (6 y 15 personas), 79 s (2 personas:
  una lleva una sola mano), el pase ~8:55.
- `learned`: pinya (≥ mitad de las manos apretadas), tronc (primer `lift`), pom (4 s seguidos de luz subiendo sin inquietud), aleta
  (≥ mitad de las manos alzadas), baixada (primer `lower`); evento `'learned:x'` una vez por pase; se vacía en cada pase.
- Público virtual: en la Pinya, tras los 15 s, las manos se van al centro del muro (al 20 % de su separación) en 6 s, a 1,1 m.
- Sonido: `pack:w` = una voz grave sin palabras y un golpe de barro suave en ese muro (el muro lleno, `wall:w`, sigue como antes).
  Sin errores (sonido solo, obra 3D en la Pinya).


- **Corrección (14:58, director):** «apretado» es relativo a las manos de ESE muro: `pack = rampa((parte de las manos del muro dentro
  de su ventana de 2 m − 0,5) / 0,3) × cercanía de esa ventana al centro del muro (1 hasta 1 m, 0 a 1,8 m)`; ≥ 80 % → apretado; una sola
  mano que siguió a su palma al centro aprieta su muro. Sin «esperado por grupo». Pruebas: apretadas y las que siguen a la palma → se
  cierra a los 50 s; separadas → sólo con la red (70,7 s); pase de 2 personas: Pinya cierra a los 50 s (bloque 58 s con el premio), sin red.


## Voces nuevas del plan (15:05) — 14 audios (7 × ES/EN), con el sí de Vicente («Sí, grábalas», transmitido por el director)
Mismas voces (Mía Evans / Lily), eleven_v4, 0,5 / 0,8, etiquetas como las demás; speech-to-text: las 14 dicen el texto, ninguna
etiqueta se pronuncia. Cableado: Pinya título `v-pinya-wait`, llamada `v-pinya-closein` al pasar a «pack» si no se han juntado; Tronc
título `v-tronc-lift`; temblor `v-tronc-wobble`; l'aleta al abrir la ventana `v-aleta-raise`, 1,5 s, `v-aleta-yours` (se omite si ya
coronaron); bajada `v-baixada-gently`. Silenciadas (no borradas): v-pinya-1, v-pinya-2, v-tronc-1, v-tronc-3, v-aleta-1, v-baixada-1;
pistas more/hold/beat/lift/foot calladas. Ninguna línea se repite en un pase. Registro en los JSON de voces y en NOTES. Sin errores
ES/EN; l'aleta en el arnés sigue coronando al alzar. Nadie las ha escuchado. **Ojo:** al callar v-aleta-1 ya nadie dice «El castell
está coronado» (si se quiere, otra línea corta para la coronación).


## T-043 · Brasa: la llamada — CAMPOS DEL ESTADO (para 3D-BR / GUI, 15:12; el código llega detrás)
`block === 'brasa'`, fase `play`:
- `brasaStage`: `'spark'` (toques sueltos, chorros y diables, como hoy: hasta que han tocado `min(8, personas)` o 20 s) → `'call'`.
- `call`: `{ n (1..3: la llamada en curso), at (reloj del score `clock`, s, del TOK), gap (s entre golpes: 0,8, más lento tras un fallo:
  1,0 / 1,2), phase (0..1: cuenta atrás desde el primer tok hasta el TOK; 0 antes), from (muro que llama), to (muro que contesta:
  = from en la 1.ª, el opuesto en la 2.ª, −1 = los cuatro en la 3.ª), hits (manos que han caído dentro de la ventana), need (cuántas
  hacen falta) }`. Los tres golpes: `at − 2·gap`, `at − gap`, `at` (el TOK). Ventana: de `at − 0,5` a `at + 0,7` s.
- `waveBig`: true si la última ola fue la grande (la llamada acertada); false = ola pequeña (fallo: la sala vuelve a llamar más despacio).
- `waves` (llamadas acertadas, 0..3), `touched` como antes. `progress` = 0,25 tras la chispa + 0,25 por llamada acertada.
- Eventos: `'call'` (empieza una llamada: suena el primer tok), `'wave'` (con `waveBig`), `'awake'` (tercera acertada: el anillo entero
  arde), `hint:together` (antes de la primera llamada). Nunca «Otra vez. Juntos.».


## T-043 hecho (15:18) — Brasa: la llamada + pase ~9:15–9:20 (score.js ×2 idénticos; respaldos `*.T043.bak`)
- `TIMES.brasa = { min 45, target 60, max 75, reward 7, spark 20, gap 0.8, slower 0.2, early 0.5, late 0.7, pause 3.2, lead 1.0 }`.
  Campos: la sección «T-043 … CAMPOS DEL ESTADO» (implementados así; `call` lleva también `armed`, interno). La chispa dura 20 s fijos
  (`hint:together` al empezar la llamada); tras la tercera acertada despierta, nunca antes del mínimo (45 s).
- **Pruebas (node, `t038/brasa.mjs`):** golpes en el TOK → olas grandes 3/3, despierta a los 45 s, bloque 52 s; 1,2 s antes o 1,3 s
  después → sólo olas pequeñas y la llamada se ralentiza (0,8 → 1,0 → 1,2), despierta por tiempo (68 s); golpes al azar → alguna
  grande por suerte. Arnés con sonido: llamadas y olas grandes con manos en la ventana; picos 0,30 / sub 0,50; sin errores.
- **Duración:** `TIMES.pom.climb` 18/20/22 → 21/23/25; `TIMES.festa` 50/65/75 → 60/76/84. Pase completo con el público virtual (node):
  9:13 (6 y 15 personas), 9:20 (2 personas) — antes 8:54–9:00 en la medida de QA.
- Público virtual: en la llamada golpea en el TOK (+0,08 s; el «sloppy», +0,45 s, aún dentro).
- Sonido: `call` = dos toks de timbal en el muro que llama y el TOK (más grave y fuerte) en el que contesta o en los cuatro; ola grande
  como antes (tabals que giran y golpe grave); ola pequeña = un solo tabal suave.
- Para GUI: la cuenta atrás del anillo puede leer `call.phase` (0..1) y `call.at`; ya no hay «0 de 3».


## T-044 · Ressonància: libre → eco → llamada → florecer — CAMPOS DEL ESTADO (para 3D-BR / festa3d, 15:19; el código llega detrás)
`block === 'festa'` (fase `play` todo el bloque):
- `festaStage`: `'free'` (0–20 s) → `'echo'` (20–45 s) → `'call'` (desde 45 s) → `'bloom'` (el florecimiento final).
- `fronts[]`: los frentes de eco en vuelo, cada uno `{ id, from (muro de salida), to (el de enfrente), at (reloj `clock` de salida),
  arrive (reloj de llegada, at + 3 s), gen (0 = onda de una mano; 1, 2… = rebotada: más ancha, más brillante, una octava arriba),
  ghost (true si lo devolvió la sala) }`. Ventana de devolución: `arrive ± 0,7 s` en el muro `to`. Un frente se retira a `arrive + 0,7`.
- `echoHits`: rebotes devueltos por el público en el pase (los de la sala no cuentan).
- `call`: la misma forma que en la Brasa (`n` 1..4, `at`, `gap`, `phase`, `from`, `to` = −1: los cuatro muros, `hits`, `need`);
  4 llamadas, cada una mayor; no se repiten al fallar (siguen adelante).
- `bloomSize` 0..1 (tamaño del florecimiento: 0,3 + 0,7 × `resonance`), `bloomDur` (s), `resonance` como antes (los golpes juntos, los
  rebotes y los aciertos de la llamada lo suben). El florecimiento ocurre SIEMPRE en la última llamada.
- Eventos: `'front'` (sale un frente), `'echo'` (rebote devuelto por una mano), `'ghost'` (la sala devuelve uno: nadie lo hizo en 12 s),
  `'call'`, `'bloom'` (el final, con `bloomSize`). Ya no hay florecimientos espontáneos a mitad del bloque.


## T-044 hecho (15:22) — Ressonància libre → eco → llamada → florecer (score.js ×2 idénticos; respaldos `*.T044.bak`)
- `TIMES.festa = { min 60, target 76, max 84, free 20, echo 48, travel 3, window 0.7, ghost 12, calls 4, gap 0.8, lead 1, pause 3.2,
  early 0.5, late 0.7 }`. Campos: la sección «T-044 … CAMPOS DEL ESTADO» (el eco termina a los 48 s, no 45, para que el pase quede en
  ~9:15). `bloomSize = 0,2 + 0,5 × unísono de las 4 llamadas + 0,3 × min(1, ecos/6)`; `bloomDur = 4 + 4 × bloomSize` s; el bloque
  termina al acabar el florecimiento. La partitura lleva ahora también las llegadas por muro (interno) para el eco.
- **Pruebas (node, `t038/festa.mjs`):** sin devolver → 1 eco casual, 1 devuelto por la sala, florecimiento 0,25 (5 s); devolviendo a la
  llegada + llamada al unísono → 18–24 ecos, 0 de la sala, florecimiento 1,0 (8 s); sin ecos pero al unísono → 0,75; 2 personas → 1,0.
  Bloque 73–76 s; pase completo (público virtual) 9:13–9:20. Arnés con sonido (ritmo 6): frentes, ecos, 4 llamadas, florecimiento;
  picos de muro ≤ 0,33, sub 0,50; sin errores; obra 3D en la festa sin errores.
- Público virtual: en el eco, alguien del muro de llegada devuelve cada frente; en la llamada todos golpean en el TOK.
- Sonido: `front` = una banda de ruido suave que sale de un muro y llega al de enfrente en los 3 s del viaje, con un destello al llegar;
  `echo` = golpe FM resonante una octava más arriba por rebote en el muro que devuelve (`ghost`, más suave); la llamada = la de la Brasa
  en los cuatro muros (ola pequeña si fallan); `bloom` crece con `bloomSize` (más campanas, más grave, dura `bloomDur`). La altura de la
  mano ya daba la octava de cada golpe de la festa.


## T-045 · Lote de la partitura tras el análisis de Beltrán — NOMBRES NUEVOS (escritos antes del código)
- `solo` (bool): el pico de manos reciente es ≤ 2 (una persona). Entonces `need` de las llamadas = 1, `needWalls` = 1, la estructura
  puede ser de 1 muro (`structure` 1 = *pilar*), y en el eco el frente vuelve al MISMO muro (se acepta devolverlo en ese o en los
  contiguos).
- `warn`: `null | 'fall' | 'abandon'` — aviso a mitad de plazo. Eventos `'warn:fall'` (Pom: 10 s sin manos de 20; bajada: 5 s de 10) y
  `'warn:abandon'` (22,5 s sin manos de 45 en un bloque interactivo). Se borra al volver una mano.
- `call.tokDone` (bool, interno-visible): el TOK ya pasó (se contaron las manos apoyadas). `call.hits` puede ser fraccionario (manos
  apoyadas que se movieron > 10 cm o se posaron en los últimos 2 s valen 0,5).
- `fronts[].u` no (es de festa3d, #21). Sin más campos nuevos: el resto de cambios son de regla (cartela como capa, Pom por cualquier
  muro, bajada con todas las manos, Tronc con máximo/base, Pinya `near` 1,8 → 3 m y cierre con un solo muro, l'aleta 10 s, espera).
- **La cartela es una capa:** durante `phase === 'title'` la partitura YA cuenta (chispa, palma, frase del Tronc, luz del Pom); los
  tiempos internos (chispa 20 s, palma 15 s) cuentan desde el inicio del bloque (`t`), no desde `play`.


## T-045 hecho (19:09) — lote de la partitura tras el análisis (score.js ×2 idénticos; respaldos `*.T045.bak`)
Hecho: #7 (v-intro-6 callada, ES/EN) · #8 cartela como capa (`playing` = play o title; chispa y palma por `t` del bloque) · #9 llamada
(aterrizajes desde el primer tok + 0,5 por mano apoyada que se movió > 10 cm o se posó < 2 s, contadas en el TOK; brasa y festa) ·
#10 `solo` (pico ≤ 2 manos: need 1, needWalls 1, estructura de 1 muro = pilar; eco al mismo muro, se acepta el contiguo) · #11a Pom por
cualquier muro con manos, `restless` sólo del muro de la luz · #11b bajada con todas las manos (fuera de la torre ×0,5; `lowerK` = el
mayor de mediana-torre y mediana-fuera×0,5) · #12 `lower 0.35` · #13 Tronc: base = mínimo de los 2 s previos, cuenta el máximo de
subir + encajar, se juzga al final de la frase; `lift` cuando suben todos los muros de la torre que tienen manos · #16 Pinya `near` pleno
hasta 1,8 m, 0 a 3 m; todo el grupo en un muro cierra con ese muro · #19 avisos `warn:fall` / `warn:abandon` a mitad de plazo, Pom 20 s,
bajada 10 s, Pom en `max` corona · #22 desplazamiento con `s` desenrollado (sin saltos en esquinas/costura) · #23 l'aleta 10 s, `> 1,6 m`
sólo tras 2 s · #24 espera `hold 0.02`, solo paga hasta 0,08/s · #28 pliegue de duplicados (< 10 cm, mismo muro) dentro de `step`.
**Pruebas (node, `scratchpad/ent/t038/items.mjs`): 16/16 PASAN; 13 fallaban con la partitura anterior** (las 3 que ya pasaban son
controles). **Bloque a bloque con 0 / 1 / 4 manos por un LiDAR simulado** (`solo.mjs`: 10 Hz, 150 ms, ±2 cm, 6 % lecturas perdidas,
1 % ids nuevos), haciendo lo que enseña la guía:
| bloque | 0 manos | 1 mano | 4 manos |
|---|---|---|---|
| espera | no se revela | revela 36 s, empieza 43 s | revela 16 s, empieza 21 s |
| brasa | abandono a 45 s (aviso a 22,5) | 3/3 olas grandes, 52 s | 3/3, 52 s |
| pinya | abandono | cierra a 50 s (pilar) | cierra a 50 s (2 muros) |
| tronc | abandono | 7 pisos, 1.º a 9,6 s | 9 pisos |
| pom | cae a 20 s (aviso a 10 s) | corona, l'aleta 0,96 | corona, l'aleta 0,36 (sólo la mitad alzó) |
| festa | florece 0,20 | 18 ecos, florece 1,0 | florece 1,0 |
| bajada | *carregat* a 10 s (aviso a 5) | 6 descensos, descarregat a 33 s | igual |
Pase completo con el público virtual: 9:19. GUION.md: Brasa y II–bajada reescritos con las reglas de hoy; `res-obra3d/NOTES.md › Solo
path` corregido; sound NOTES al día.
**Para GUI / partes:** `solo`, `warn` (+ eventos `warn:fall`, `warn:abandon`), `call.tokDone`; la cartela ya no detiene la partitura
(las partes pueden responder desde el primer segundo y la guía debe enseñar ya bajo la cartela).

## Qué falta / riesgos
- fps sin medir (QA). Integración (INT). Escucha real del sonido (nadie). Las esquirlas son poliedros extruidos con bisel: se leen como
  cerámica/cromo, pero de cerca podrían querer más detalle (normal map de esmalte craquelado) en la segunda pasada.
- Respaldo: `score.ARTE2.js.bak` (las dos copias), `sound.ARTE2.js.bak`, `manifest.ARTE2.json.bak`, `NOTES.ARTE2.md.bak`. Volver = copiar
  los .bak encima.
- **Coronación (15:05):** `v-aleta-crowned` = v-aleta-1 recortada tras su primera frase (EN desde 2,23 s, ES desde 1,86 s, fundidos 30/120 ms; originales intactos); STT «The castell is crowned» / «El castell está coronado»; suena 1,6 s después del disparo.
- **15:25:** `learned.brasa` en la primera ola grande de la llamada y `learned.festa` en el primer eco devuelto (ambas copias idénticas); node: con el gesto 29,3 s / 33,8 s, sin él nunca.

## T-050 · Pom: tres subidas distintas · Acta: la huella — NOMBRES DEL ESTADO (POS, para POV/T-051; escritos ANTES del código)
Posición de una mano en todo lo nuevo = `{ stroke, wall, dx, y, s }` (muro, m desde su centro + a la derecha, m desde el suelo, m a lo
largo del perímetro como entra en la partitura). `S.strokes[]` gana `dx`, `s`, `size` y `still` (s seguidos quieta: < 15 cm en 1 s).
**Pom** (`climber` 0/1/2 y `climb` 0..1 siguen como antes; `progress` = (climber + climb) / 3):
- `pomStage`: `'relay' | 'breath' | 'silence'` (= climber 0/1/2: Dosos / Acotxador / Enxaneta). `pomRest` (s, > 0): ella descansa tras
  llegar (`arrived:n` → `climber:n+1`), la subida siguiente no avanza hasta que vuelve a 0 (7 s).
- **relay** · `pomHolder` = posición de la mano que la tiene (o `null` si aún no hay manos; se queda en la última posición si la mano se
  pierde) · `pomFrom` = de dónde voló · `pomFly` 0..1 (vuelo de 1,5 s; 1 = posada) · `pomFalter` 0..1 (la mano que la tiene se mueve:
  tiembla; en 1 vuelve a la anterior) · `pomThread[]` = posiciones de TODAS las manos que la llevaron, en orden (máx. 24; queda durante
  aliento y silencio, se borra al empezar el Pom) · `pomHandoffs` (cuántos relevos) · `pomHandoff` = `{ from, to, back, at }` del último
  vuelo (`back` = vuelve tras titubear; `at` = `S.clock`). `lightWall` = muro de `pomHolder`, `nextWall` = muro del siguiente candidato.
  Eventos: `'handoff:<muro destino>'` (el vuelo empieza; aterriza 1,5 s después) · `'falter'` (empieza a titubear).
- **breath** · `pomBreath` 0..1,25 (velocidad de subida: cuota de manos quietas² × más manos quietas = más) · `pomGust` 0..1 (una
  racha: decae en 1,5 s; mientras > 0,3 no sube, nunca baja). Evento `'gust:<muro>'` (una mano se movió > 35 cm en 1 s; ≥ 1,5 s entre rachas).
- **silence** · `pomHush` 0..1 (lo hondo del silencio: 1 = todas quietas) · evento `'hush:break:<muro>'` (alguien se movió; pierde un
  poco, ≥ 1,2 s entre roturas) · al llegar: `phase 'reward'` = **1,5 s de silencio** → `phase 'aleta'` (igual que hoy).
- `restless`: relay = la mano que la tiene se mueve; breath/silence = alguna mano se mueve. Avisos, plazo y `max` como hoy.
**Acta**: `prints[]` = `{ wall, dx, y, s, size, t }` (t = `S.t` del acta al posarse). Una huella por mano que reposa ≥ 0,5 s entre los
3 y los 15 s del acta (una mano nueva = una huella nueva; no dos a < 15 cm en el mismo muro), máx. 60; se borran al entrar en el acta y
al volver a la espera. Evento `'print:<muro>'`. `acta()` devuelve además `prints` (cuántas). `printOpen` (bool): la ventana 3–15 s.
Valores (§4.10): Força y Equilibri como hoy; **Valor** = quietud en el Pom (60 %) + manos alzadas en l'aleta (40 %); **Seny** = suavidad
de la bajada (descensos limpios / descensos + crujidos + soltados), 0,15 si cayó.
**Cadena de muro del acta** (GUI/POV): **«Dejad vuestra mano»** (EN «Leave your hand»), de 3 a 15 s.

## T-050 hecho — Pom tres subidas · Acta la huella · sonido · público virtual (score.js ×2 idénticos; respaldos `*.T050.bak`)
Ajustes respecto a los nombres de arriba: `pomRest` = **7 s**; el nacimiento de la luz también emite `'handoff:<muro>'` con
`pomHandoff.from = null` (nace allí, sin vuelo; `pomHandoffs` no cuenta el nacimiento); al volver tras titubear pierde `relay.cost` 0,04.
TIMES: `pom.climb [38, 16, 10]` (relevo ≈ 32 s tras la cartela; aliento a velocidad 1 = 16 s), `pom.rest 7`, `pom.reward 1.5` (el
silencio), `pom.relay { every 4, fly 1.5, ready 1, falter 1.2, cost 0.04, gone 1, thread 24 }`, `pom.breath { slow 0.7, more 0.35, many 4 }`,
`pom.gust 0.35`, `pom.gustGap 1.5`, `pom.breakGap 1.2`, `pom.breakCost 0.06`, `print { from 3, to 15, rest 0.5, max 60, near 0.15 }`.
**Para TUN (nombres al estilo `t.<ruta>`, NO añadidos a tuning.js — es de TUN):** `pinya.nearFull` (1,8 m: el paquete cuenta entero
hasta aquí del centro), `pinya.nearZero` (3 m: 0 aquí), `tronc.base` (0,15 m: una mano que no sube y se movió menos es base) — ya en
TIMES y leídos en cada paso. Candidatos del Pom nuevo: `pom.relay.every`, `pom.relay.falter`, `pom.gust`, `pom.breakCost`, `print.rest`.
**Parche de TUN aplicado en sound.js:** `import { createScore, TIMES }` + `import { applyTimes } from './tuning.js'`; la rama `ctl` hace
`applyTimes(T, m.times, TIMES)` (cabecera: `{ type: 'ctl', pace?, jump?, times? }`).
**Arreglo de estabilidad (fold, #28):** dos manos plegadas como una (id nuevo a < 10 cm) que luego se separan > 30 cm vuelven a ser dos.
Antes la segunda quedaba invisible para la partitura mientras siguiera apoyada (p. ej. dos personas juntas en la Pinya que luego se
abren). Efecto en el pase virtual: con el público repartido, el Tronc sube algo antes (121 s en vez de 127,6 con 6 personas).
**Pruebas (node, `scratchpad/pos/t050.mjs`): 20/20 PASAN; con la partitura anterior 15 fallan** (5 pasan: sala vacía, todos
se van, `max`, acta sin manos, y el aliento de 4 manos que por casualidad caía en 16 s). Anteriores: `items.mjs` 16/16, `solo.mjs` igual que antes salvo el Pom.
| subida | 0 manos | 1 mano | 2 manos (una persona) | 4 manos |
|---|---|---|---|---|
| relevo | aviso 10 s, cae 20 s | 38 s, sin relevos (hilo 1) | 38 s, 7 relevos entre sus dos manos | 38 s, 7 relevos, hilo de 4 manos en 2 muros |
| aliento | — | 22,9 s | 20,4 s | 16,7 s (grupo grande ≈ 15 s) |
| silencio | — | 10 s → 1,5 s callado → l'aleta | 10 s | 10 s |
| acta | 0 huellas | 2 (una mano que se levanta y vuelve) | — | 5 |
Manos que se mueven: la que tiene la luz → `falter` y vuelve a la anterior (+2–3 s); una sola mano inquieta no sube (sólo la red tardía);
2 de 4 manos moviéndose en el aliento → más del doble de lento; un golpe brusco → `gust`, no cae; en el silencio una mano que se mueve
→ `hush:break` y no llega. Pase virtual completo (2/6/15 personas): **9:24 / 9:18 / 9:18**; Pom 84/82/82 s.
`check.mjs /sound/ressonancia-sound` en silencio, saltando a pom y acta con 4 manos: 0 errores; eventos handoff/gust/arrived/print llegan.
**Sonido:** campana de vidrio en el muro que la recibe al posarse (más baja y suave si vuelve) y una nota tenue bajo la mano que deja;
`falter` = un destello inseguro; el aliento abre el aire con `pomBreath`, la racha = una banda de viento en ese muro; el silencio = el
lecho del Pom a 0,06, viento ×0,15, el hilo como tono sostenido y el latido; `hush:break` = un «ah» de tres voces muy bajo; la llegada =
un destello y 1,5 s a cero; cada huella = un toque cálido grave (D pentatónica) y un golpe suave al sub (más flojo en ráfagas).
Voz nueva propuesta (no grabada; necesita el sí de Vicente): «The square holds its breath.» al empezar el aliento.
**Cadena de muro del acta:** «Dejad vuestra mano» (EN «Leave your hand»), de 3 a 15 s (`printOpen`).
**T-050b (tuning, POS):** `tuning.js` (×2 idénticos) +12 umbrales: `pinya.nearFull/.nearZero`, `tronc.base`, `pom.climb.0/.1/.2`,
`pom.relay.every/.ready/.falter`, `pom.gust`, `pom.breakCost`, `print.rest`; «sala»: nearFull 2,1 · nearZero 3,3 · base 0,22 · ready 1,2 ·
falter 1,8 · gust 0,5 · breakCost 0,03 · print.rest 0,6. `res-obra3d/manifest.json` regenerado desde `manifestParams()` (58 parámetros;
los 37 de antes idénticos). `PRUEBA-SALA.md`: tabla de `t.…` (49) y filas Pom / acta. Respaldos `*.T050.bak`.

## T-055 · Intro: faroles con la mano · Brasa: altura → tono + EL RELEVO — NOMBRES DEL ESTADO (SCO2, para VIS2/T-056; escritos ANTES del código)
Marco de posición: `s` en **metros a lo largo del perímetro**, el mismo de las manos (`P4` empieza en 0; sala XR Lab 27,577 m; esquinas en
0 · 7,33 · 13,813 · 21,166). La partitura lo calcula de `wall` + `dx` con las longitudes de los muros (`createScore(nW, { lengths })`;
por omisión las del XR Lab), así que no depende de que la mano traiga `s`.
**Intro** (`block === 'intro'`; sin metas, sólo escucha esto):
- Evento `'lamp:<muro>'` por cada mano que **aterriza** (≥ 0,25 s entre dos del mismo muro). Carga: `S.lamp = { wall, s, dx, y, at, n }`
  (la última; `at` = `S.clock`, `n` = cuántas en esta intro) y `S.lamps[]` = las de ESTE paso (se vacía cada paso). La parte visual
  elige el farol más cercano a `(wall, dx)` / `s`. Sin manos no se emite nada: los faroles siguen encendiéndose solos al ritmo de hoy.
**Brasa** — `brasaStage`: `'spark'` (0–12 s, `brasa.spark` 20 → **12**) → **`'relay'`** → `'call'` (la llamada, sin cambios).
- `relay` = `{ s (m, posición del diable en el perímetro), lap (0..1 de la vuelta), holderWall (muro donde está el diable), holder
  (stroke de la mano sobre la que está, o null), y (m, altura a la que dibujarlo: la de su mano o la de la mano a la que corre),
  speed (m/s ahora), target ({ stroke, wall, s, y } | null: la mano a la que corre), stall (s sin mano delante), assist (bool: otros
  diables lo van a buscar), jumps, corners, jump ({ from, to, at } último salto: muros), corner ({ wall (el muro en que entra), s, at }),
  done (bool), s0 (m, donde nació), perimeter (m) }`. Vive desde que empieza el relevo hasta el final de la Brasa (en `'call'` queda `done`).
- Reglas: nace junto a la mano que aterrizó la última (sin manos: centro del muro 0). Corre a paso de persona (`relayRun` 1,2 m/s) hacia la
  mano **por delante** (sentido +s) más cercana a ≤ `relayReach` 2,5 m y **salta** a ella (`'relay:jump'`). Una mano arrastrada por
  delante se sigue (una persona sola lo pasea). Sin mano delante: casi se para (`relayCrawl` 0,08 m/s) y cuenta `stall`; a los
  `relayStall` 6 s otros diables lo buscan (`'relay:assist'`, `assist` true): va a `relayFetch` 0,9 m/s hasta la siguiente mano a
  cualquier distancia. Red: en los últimos 10 s de `relayMax` 30 s acelera lo justo para cerrar la vuelta (siempre se completa).
  Vuelta entera → `'relay:lap'` y empieza la llamada como hoy.
- Eventos: `'relay:start'` (nace) · `'relay:jump'` (salta de una mano a otra: `relay.jump`) · `'corner'` (cruza una esquina:
  `relay.corner`, una llamarada) · `'relay:assist'` (los otros diables salen a buscarlo) · `'relay:lap'` (la vuelta completa: la estela entera).
- `progress` no cambia de forma: chispa hasta 0,25, el relevo la deja en 0,25, la llamada +0,25 por ola grande.
- Altura → tono: nada nuevo en el estado (el sonido lee la altura de la mano).
TIMES nuevos (planos dentro de `brasa`, ajustables `t.brasa.relay*`): `relayReach 2.5, relayRun 1.2, relayCrawl 0.08, relayStall 6,
relayFetch 0.9, relayMax 30, relayNear 0.15`.

## T-055 hecho — faroles · altura → tono · el relevo (score.js ×2 y tuning.js ×2 idénticos; respaldos `*.T055.bak`)
Implementado como en los nombres de arriba. `createScore(nW, { lengths })` (sound.js pasa los anchos de `vt.walls`; por omisión XR Lab).
**Pruebas (node, `scratchpad/t055/relay.mjs`): 24/24 PASAN** (con la partitura anterior no corre: no hay relevo). Vuelta del relevo:
0 manos 30 s (ayuda a los 6 s, 4 esquinas) · 1 mano quieta 27,9 s (ayuda 6 s) · 1 mano arrastrada a 1 m/s 28,3 s sin ayuda · a 0,5 m/s
30 s (red) · 4 manos quietas en 2 muros 29,8 s (4 saltos + ayuda) · cadena de 4 manos que se adelantan 22,4 s, 11 saltos, sin ayuda ·
anillo de 12 manos 23,3 s, 11 saltos, luego 3 olas grandes y despierta (bloque 56,7 s). La llamada igual (fallos: 0,8 → 1,0 → 1,2).
Intro: sin manos 0 faroles y Brasa a los 70 s; un toque cada 3 s → 24 faroles en su muro. Anteriores: `pos/t050.mjs` 20/20,
`t038/items.mjs` 16/16. Pase virtual (node, cadena en el relevo): **9:31 / 9:18 / 9:24** (2/6/15 personas; antes 9:24/9:18/9:26).
`check.mjs` del sonido (intro + Brasa con manos) y de `res-obra/simulate.html` (6 personas, relevo con cadena: 14 saltos, vuelta
entera): 0 errores. **Sonido:** farol = campana suave + toque cálido en su muro (Re mayor pent.); Brasa: ember + tambor + piedra
afinados por la altura (Re menor pent., 0,5–1,9 m); relevo: fuego que corre (ruido en banda en el muro del diable, más brillante con la
velocidad, chisporroteo), salto = soplo de muro a muro, esquina = llamarada + piedra, ayuda = chispas y tabals suaves, vuelta = llamarada
en los cuatro muros + golpe grave. **Para GUI:** `guide3d.js:52` muestra «Tocad el muro» también en `brasaStage 'relay'` (quizá
«Pasad el fuego»). Voz propuesta (no grabada; necesita el sí de Vicente): «Carry it. Pass it on.» al empezar el relevo.
