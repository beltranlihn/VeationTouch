# Ressonància — análisis de la obra para la toma de dirección (02)

Para Beltrán · noche del 24-11-2026 · estreno el jueves en Barcelona XR Lab
Leído sobre `lab/vicente` **7a056a2** (copia de sólo lectura en `.data/worktrees/lab-vicente`). No se ha modificado nada.
Rutas relativas a `lab/experiments/` de esa copia salvo que se diga otra cosa; formato `archivo:línea`.

**Método y límites.** Lectura directa de la partitura (`ressonancia/score.js`, entera), la guía (`scenes3d/guide3d.js`), el
anfitrión (`res-obra3d/experience.js`), el sonido (`ressonancia-sound/sound.js`, tramos de voz, música y canal) y el runtime real.
Las partes 3D (≈ 900 KB de código) se auditaron con dos lecturas delegadas más mis comprobaciones puntuales. **No se lanzó ningún
render** (instrucción expresa): todo lo visual sale del código y de las capturas que hay en el repositorio.
**Aviso sobre las capturas:** el álbum `lab/estudio/album3/00-contact.png` es anterior a la última ronda (muestra textos ya
retirados, p. ej. «Buscad un círculo y sostenedlo»). **No existe ninguna captura del Tronc actual (porcelana) ni de la caída
actual**: lo que digo de ellos es sólo por código. Lo más reciente que hay es `lab/estudio/notas/vis2/t056-sheet.jpg` (intro y
Brasa con relevo) y `notas/caps-gui/c8-guide-batch.png` (guía). Regenerar el álbum es la primera tarea de la noche.

---

## 0. Diagnóstico en una pantalla

1. **La partitura ya no es el problema principal.** De las 28 correcciones del análisis anterior (6491dd9), 20 están hechas
   (§3.4). La obra tiene camino en solitario, avisos antes de caer, cartelas que no bloquean, relevo en la Brasa y en el Pom, huellas
   en el acta. Lo que queda roto es **de puesta en escena**, no de reglas.
2. **Lo que el visitante hace casi no cambia lo que pasa.** Todos los bloques terminan igual por reloj: Brasa despierta a los 68 s,
   la Pinya cierra a los 92 s, el Tronc sube solo desde el 115, el Pom corona a los 120 s pase lo que pase, la ressonància florece
   siempre, la bajada baja sola desde el 38. La diferencia entre «hacerlo perfecto» y «no hacer nada» es de segundos y de un
   tamaño de efecto, nunca de **relato**. Esa es la raíz de «gente moviendo las manos».
3. **La respuesta a la mano es pequeña y lejana.** Los mundos están a 6–12 m detrás del muro: un diable mide ~0,5 m en el muro, un
   cuerpo de la Pinya ~0,9 m, una tesela < 0,3 m. La mano produce chispas, pétalos, granos, esquirlas: **partículas a escala de
   azulejo** sobre fondos ya muy texturados. Lo grande (ola, coronación, florecimiento) llega segundos después y sin vínculo
   visible con quien lo causó.
4. **La voz narra pero no dirige.** Sale por `roomInput` (igual en los cuatro muros, `sound.js:157`): no puede decir «mirad
   allí». No hay ninguna línea para el relevo de la Brasa, el eco, la llamada final ni las tres subidas del Pom; hay 70 s de
   introducción hablada sin tarea y después consignas de 2–4 palabras.
5. **El texto es pequeño, está alto y es idéntico en los cuatro muros.** La consigna mide ~10 cm de mayúscula a 1,98–2,30 m
   (`guide3d.js:77, 280, 531`); la cartela está centrada a 2,68 m (`guide3d.js:277`); la glosa y el contador del acta, ~6 cm.
   Nada tiene dirección (no hay «este muro llama», «id allí»).
6. **Calidad visual: ingeniería alta, dirección de imagen baja.** Sin sombras, sin AO, sin profundidad de campo; casi todo es
   `MeshBasic` emisivo + bloom + ACES; figuras humanas hechas de puntos o de elipsoides fundidos; 40–60 % superior de los muros en
   negro; los cuatro muros repiten la misma composición. Cada capítulo cambia de lenguaje (trencadís físico → plaza realista →
   partículas de fuego → nube de puntos → porcelana → alambre CAD → oro líquido → siluetas): no hay un mundo, hay ocho demos.
7. **Riesgos técnicos que hay que cerrar esta noche:** impactos y órdenes duplicados por la instancia del visor (sin guardia
   `vt.sink`, §6.2); WebGPU con caída a Spout por CPU (§6.1); 15 s en negro al cargar; el mapa de audio real deja P2 y P3
   indistinguibles justo donde la obra usa «muro opuesto»; cinco carpetas hermanas.

---

## 1. La historia (15 líneas)

1. **Fuente:** los *castells*, las torres humanas de las plazas de Cataluña, y su lema: «Força, equilibri, valor i seny».
2. **Tesis** (voz, `audio/es/voice-lines-es.json`): «Un castell no lo construyen los que suben. Lo construyen los de abajo: cientos
   de manos, apretadas, sosteniendo.» El público **es la pinya**; los muros son la plaza.
3. **Idea formal:** «trencadís digital» — el mundo está hecho de teselas rotas que el grupo vuelve a juntar (`RESSONANCIA.md §2`).
4. **Curva del cuerpo = curva del relato:** manos abajo y juntas → suben piso a piso → quietas → una mano en alto → libres → bajan.
5. **Umbral (espera):** una serpentina de trencadís con cuatro puertas; jugar revela el anillo de inicio.
6. **Intro, La plaça (70 s):** la plaza de noche; la voz cuenta qué es un castell; el lema, una palabra por muro; el título.
7. **I · Brasa, «El despertar»:** el correfoc. Encender, pasar el fuego alrededor de la sala, responder juntos a la llamada del timbal.
8. **II · Pinya, «Fuerza»:** palma con palma con una multitud de luz; juntarse hombro con hombro hasta cerrar el círculo.
9. **III · Tronc, «Equilibrio»:** levantar la torre piso a piso con las manos, mantenerla recta, sujetarla cuando tiembla.
10. **IV · Pom de dalt, «Valor»:** la sala sube 90 m; tres niños trepan (dosos, acotxador, enxaneta) mientras la plaza calla:
    relevo, aliento, silencio.
11. **L'aleta:** la enxaneta levanta la mano; el público levanta la suya; el castell se corona.
12. **V · La ressonància:** la plaza es del público — ondas, eco entre muros, unísono, florecimiento.
13. **La bajada, «Seny»:** «un castell sólo está completo cuando baja»; las manos lo bajan despacio, al amanecer.
14. **El acta:** «3 de 7 · descarregat», los cuatro valores, la huella dorada de cada mano. Si cayó: *carregat* o *intent*.
15. **Emoción buscada:** de la curiosidad al esfuerzo compartido, al silencio contenido, a la euforia, al cuidado. **Hoy el arco
    está escrito en la voz y en la música, pero no en lo que el público ve que provoca.**

---

## 2. Línea de tiempo por bloque

Tiempos de `TIMES` (`ressonancia/score.js:29-49`). «t» = segundos desde el inicio del bloque. Las cartelas (4 s visibles,
`guide3d.js:32`) son una capa: la partitura escucha por debajo (`score.js:332`). Texto: cartela centrada a 2,68 m (nombre en serif,
mayúscula ≈ 0,31 m), consigna a 1,98 m (2,12 m en la espera, 2,30 m en Tronc y bajada; Geist, mayúscula ≈ 0,10 m), etiqueta mono
debajo (≈ 0,06 m); **las mismas palabras centradas en los cuatro muros**; entran enfocándose palabra a palabra (60 ms) y salen
rompiéndose en teselas (`guide3d.js:65-83`, `typo3d.js`). Voz: una línea a la vez, por toda la sala, la música baja al 42 %
(`sound.js:205-216`); una línea no se repite en un pase.

Pase típico: intro 70 + Brasa ~60 + Pinya ~70 + Tronc ~115 + Pom ~90 + aleta ≤ 10 + coronación 25 + ressonància ~74 + bajada ~40 +
acta 40 ≈ **10 min**, más la espera.

### 2.0 Espera (umbral) — libre

| | |
|---|---|
| Se ve | Serpentina de trencadís (hueso, grafito, espejo) en los 360°; una puerta en arco dorado en el centro de cada muro; móviles colgantes (`parts/umbral3d.js`). |
| Se oye | Ambiente; cada toque suena al instante. Voz «Tocad. Jugad con la sala.» sólo si hubo manos y llevan 6 s fuera, como mucho cada 40 s (`sound.js:54, 938`). **Con la sala vacía y recién entrada, la voz no invita nunca.** |
| Texto | «Tocad. Jugad con la sala.» a 2,12 m → al revelar: «Sostened el anillo para empezar» (`guide3d.js:44`). |
| Manos | Tocar = ola de color de ~7 m que recorre el mosaico, caen 9–13 piezas en 0,9–1,25 m; mantener 0,6 s = cascada de la columna (`umbral3d.js:701-818`). Cada aterrizaje suma 0,035 y cada mano presente 0,02/s a un banco que paga ≤ 0,055/s (0,08/s en solitario) (`score.js:31, 339-345`). |
| Fin | `reveal` = 1 (≥ ~13–18 s jugando; en solitario sostenido ~50 s) → voz «Sostened el anillo para empezar» (+1,4 s) → una mano a ≤ 0,55 m del centro de un muro **a cualquier altura**: 3 s con dos manos, 4,5 s con una (`score.js:347-349`). Las cuatro puertas se atraviesan. |
| Nadie | No se revela nunca; tras 6 s vacía decae en 60 s. Una mano fantasma toca cada 2,6–5,2 s (`umbral3d.js:831-845`). |

### 2.1 Intro, La plaça — 70 s fijos

| t (s) | Se ve | Se oye |
|---|---|---|
| 0 | Plaza nocturna a oscuras; golpe grave | `m-intro` (una toma), bombo sub |
| 8,5 | Faroles que se encienden por programa | «Desde hace más de doscientos años, en las plazas de Cataluña, la gente levanta torres.» |
| 17 | Línea ámbar de horizonte (atmos); el castell de partículas a 8,5 m | «Sin piedra. Sin cuerdas. Sólo cuerpos, uno sobre otro, hasta diez pisos de altura. Los llaman castells.» |
| 29 | Plaza en reposo, polvo | «Un castell no lo construyen los que suben. Lo construyen los de abajo: cientos de manos, apretadas, sosteniendo.» |
| 41 | | «Esta noche, estos muros son la plaza. Y vosotros sois la pinya.» |
| 46,3–57,8 | La plaza se rompe en losas de imagen en los cuatro muros | |
| 53–62,6 | Lema, **un muro tras otro cada 2 s**: «Fuerza / FORÇA», «Equilibrio», «Valor», «Seny» (serif 0,5 em a 2,0 m) (`introtext.js:9, 46`) | 53,3: «Fuerza. Equilibrio. Valor. Y seny.» |
| 63,8–76 | «Ressonància» en los cuatro muros (0,68 em a 2,05 m) | — («Poned las manos sobre el muro» silenciada, `sound.js:43`) |

- **Manos:** cada aterrizaje enciende el farol más cercano (evento `lamp:w`, `score.js:351-357`, `plaza.js:1168-1190`) y aparta
  polvo. Los faroles están a 8–10 m: **es casi imperceptible** y no cuenta para nada. Sólo antes del segundo 46.
- **Nadie toca:** idéntico. **Fin:** reloj.
- **Lectura:** 70 s de documental en una sala donde acaban de enseñarte a tocar. El lema muro a muro es el único momento de toda la
  obra en que el texto usa la sala como espacio.

### 2.2 I · Brasa — 45 a 75 s

| t (s) | Fase | Se ve / texto | Voz / sonido | Qué cuentan las manos |
|---|---|---|---|---|
| 0–4 | cartela | «I · Brasa · El despertar» a 2,68 m; debajo «Tocad el muro» | «Todo castell empieza en la oscuridad, con un solo gesto. Tocad el muro.» (5,8 s) · `m-brasa` | chorro de chispas, un diable por mano |
| 0–12 | chispa | lecho de brasas en el suelo, 4 pebeteros, cromo | brasas, fuego | nada decide: 12 s por reloj (`score.js:368`) |
| 12–≤ 42 | **relevo** | «Pasad el fuego»; un diable corre **en un solo sentido** a 1,2 m/s hacia la mano más cercana por delante (≤ 2,5 m) y salta a ella; destello en cada esquina (`score.js:197-241`) | **ninguna línea de voz** | una vuelta completa (27,6 m). Sin mano delante casi se para; a los 6 s otros diables lo llevan; red en los últimos 10 s |
| después | **llamada** ×3–5 | «Con el tambor»; anillo de fuego que se contrae; mano fantasma que aterriza en el TOK | «Ahora, todos a la vez.» · timbal tok · tok · **TOK** (0,8 s) | aterrizajes desde el primer tok hasta TOK + 0,7 s, más ½ por mano apoyada que se movió > 10 cm o llegó hace < 2 s; hacen falta 40 % del grupo (2–5; 1 en solitario) (`score.js:107-114, 373-389`) |
| | | acierto: ola grande que da la vuelta; fallo: ola pequeña y la llamada se alarga 0,2 s | «Otra vez. Juntos.» (pista `again`, no se emite en la partitura actual) | |
| fin | premio 7 s | el lecho se recoge en 4 hogueras | | 3 olas grandes y t ≥ 45, **o t = 68 sin condición** (`score.js:393`) |

- **Nadie toca:** el diable se arrastra, lo llevan, la llamada falla y a los 68 s «despierta» igual. A los 22,5 s vacía: «Volved al
  muro»; a los 45 s vuelve a la espera.
- Las llamadas van «un muro → ése y el opuesto → los cuatro» (`score.js:385`), pero cuenta cualquier muro.

### 2.3 II · Pinya — 50 a 100 s

| t (s) | Fase | Se ve / texto | Voz | Qué cuentan las manos |
|---|---|---|---|---|
| 0–4 | cartela | «II · Pinya · Fuerza»; «Juntaos» | «Alguien espera vuestra mano.» | |
| 0–15 | palma | multitud de cuerpos de puntos turquesa y fibras coral; donde aterriza una mano sale una figura y apoya su palma (18 figuras); anillos de guía 6 s | | evento `palm` (sonido) |
| 15→ | juntarse | las figuras se deslizan hacia el centro del muro | «Juntaos. Hombro con hombro.» (si aún no lo hacen) | por muro: ≥ 80 % de sus manos dentro de una ventana de 2 m centrada a ≤ 1,8 m del centro (nada a 3 m); llenar 10 s; cerrar = los muros necesarios (1 en solitario, 2/3/4 según grupo; **1 si todo el grupo está en un muro**) llenos y con manos 3 s (`score.js:400-425`) |
| 46→ | ayuda | la multitud cierra el hueco (60 %) | | |
| fin | premio 8 s | rotllana, los puntos se vuelven teselas | «El círculo se ha cerrado.» · crujido a +4,5 s | cerrado y t ≥ 50, **o t = 92** |

- **Nadie toca:** se vacía; aviso a 22,5 s; abandono a 45 s. **Consecuencia que queda:** los muros sostenidos son «la estructura»
  (pilar / torre / tres / quatre) para el resto de la obra (`score.js:431-433`). Es la única decisión del público que persiste, y
  **nadie se la cuenta**.

### 2.4 III · Tronc — 85 a 145 s

| t (s) | Se ve / texto | Voz / sonido | Qué cuentan las manos |
|---|---|---|---|
| 0–4 | «III · Tronc · Equilibrio»; «Levantad» + nombre del piso (Baixos, Segons…) a 2,30 m | «Ahora, levantad. Cada piso sube con vuestras manos.» | |
| toda | Torre de porcelana blanca (cuerpos SDF) a 6,5 m, en los muros de la estructura; banda de «hombros» a la altura de las manos; mano fantasma que baja, sube y se queda con la frase; en los demás muros «Ayudad desde aquí» | stems a 100 BPM (compás 2,4 s) que se abren con los pisos | frase de 4,8 s: reunir 0–1,2 · subir 1,2–3,6 · encajar 3,6–4,8. Sube quien alcanza ≥ 0,33 m sobre su mínimo de los 2 s previos; quien no sube y se mueve < 15 cm es «base»; muros sin torre valen la mitad (`score.js:468-512`) |
| piso ≥ 3 | dos anillos (±0,65 m); la torre se inclina hasta 7° | «Mantened la torre recta. Sostened los dos lados.» (pista) | `lean` = (alturaIzq − alturaDer)/0,4; inclinada ≥ 0,45 ⇒ la frase vale × 0,4 |
| piso 7 (o tarde) | grieta, «Sujetad la base», mano fantasma hacia abajo | «Tiembla. Sujetad la base.» · la música se va al 12 % | 5 s para tener una mano por debajo de 0,95 m durante 1 s en ese muro, o pierde un piso (`score.js:460-466`) |
| fin | premio 6 s, corte seco de la música | | 9 pisos y t ≥ 85; ≥ 7 pisos a t = 115; **o t = 139** |

- Con gesto perfecto: ~1,4 frases por piso al principio, 9 pisos en ~90 s. Sin gesto (manos apoyadas): 0,15–0,20 por frase → 1–2
  pisos hasta el 115, y entonces la ayuda (`assist × 2,6`, `score.js:497-503`) sube el resto. **Nadie toca:** nada hasta el aviso y
  el abandono.

### 2.5 IV · Pom de dalt — 70 a 120 s, y l'aleta ≤ 10 s

| t (s) | Subida | Se ve / texto | Voz | Regla |
|---|---|---|---|---|
| 0–4 | | «IV · Pom de dalt · Valor»; la sala sube de 1,6 a 90 m por una ciudad de líneas blancas | «Ahora, el valor. Los más pequeños suben los últimos. La plaza contiene el aliento.» (7 s) → al empezar: «Quietos. Llevad su luz.» | quieta = se movió < 15 cm en 1 s |
| ~38 s | **relevo** (Dosos) | «Quietos · DOSOS»; la luz nace bajo la mano más quieta y cada 4 s vuela (1,5 s) a otra mano quieta de cualquier muro, dejando un hilo de oro | campana en el muro que la recibe | sube mientras la mano que la tiene esté quieta; si se mueve 1,2 s, vuelve a la anterior (−4 %) (`score.js:539-568`) |
| +7 s descanso, ~16–23 s | **aliento** (Acotxador) | «Contened el aliento · ACOTXADOR» | | velocidad = (fracción quieta)² × (0,7 + 0,35 × (manos quietas − 1)/4); un movimiento > 0,35 m = racha: se para 1,5 s (`score.js:569-575`) |
| +7 s descanso, 10 s | **silencio** (Enxaneta) | sólo «ENXANETA» | casi silencio; cada movimiento se oye | sube sólo si **todas** están quietas; moverse cuesta 6 % (`score.js:576-582`) |
| 1,5 s | silencio | | | |
| **aleta**, ≤ 10 s | | **sin texto**; la enxaneta (icono) a ~3,2 m; manos fantasma que suben 80 cm; de cada mano alzada, un rayo de oro hasta el techo (8–30 cm de ancho) | «Ella levanta la mano.» … 1,5 s … «Levantad la vuestra.» (termina hacia el segundo 5,5) · *swell* que sube | cuenta subir ≥ 0,28 m o estar por encima de 1,6 m pasados 2 s; corona cuando el 60 % lo hizo en 2 s, **o a los 10 s** (`score.js:604-624`) |

- Desde t = 90 la luz sube sola (+1/25 por s); a t = 120 corona estrecho, **nunca cae** por no llegar. Sólo una sala vacía 20 s
  cae (*intent*; aviso «Manos al muro» a los 10 s) (`score.js:591-600`).
- **El relevo no acelera nada:** con una sola mano quieta la primera subida dura los mismos 38 s que con diez relevos
  (`gain = 1`, `score.js:566`). Es decoración sobre un temporizador.

### 2.6 Coronación — 25 s fijos; V · La ressonància — 60 a 84 s

| t (s) | Se ve / texto | Voz / sonido | Manos |
|---|---|---|---|
| coronación 0–25 | oro líquido, arena de 600 000 partículas; 3–14 s cartela «V · Coronado · 3 de 7» | golpe de `m-crown`, campanas de vidrio por los muros, clamor; «El castell está coronado.» (+1,6 s) | nada cuenta (`score.js:626`) |
| festa 0–20 **libre** | 0–7 s «La plaza es vuestra»; cada toque, un anillo dorado que recorre varios metros e interfiere con los demás | «Ahora, la plaza es vuestra.» · stems de fiesta | suma `resonance` (aterrizajes de ≥ 2 en 0,5 s) |
| 20–48 **eco** | **sin texto**; un frente sale de la mano y cruza al muro de enfrente en 3 s; mano fantasma que aterriza 0,8 s antes de la llegada | **sin voz** | aterrizar en el muro de llegada a ± 0,7 s lo devuelve doblado; con ≤ 2 personas vuelve a su muro o a los contiguos; a los 12 s sin devolver, la sala lo hace (`score.js:636-654`) |
| 48→ **llamada** ×4 | **sin texto**; anillo en los cuatro muros | timbal tok · tok · TOK; **sin voz** | como en la Brasa; cada acierto agranda el final |
| ~68–76 | **florecimiento**, 4–8 s, siempre (tamaño 0,2–1 = ½ unísono + 0,3 ecos + 0,2 base) | | |

### 2.7 La bajada — 30 a 50 s

- **Se ve:** amanecer violeta y melocotón, siluetas negras de la plaza, la torre vuelta esquirlas de vidrio; una banda a 1,6 m.
  Texto «Bajadlo despacio» + nombre del piso a 2,30 m; mano fantasma que sube a 1,6 y baja a 1,0.
- **Se oye:** «Despacio. Piso a piso.» (+1,2 s); la fiesta se apaga, `m-baixada`.
- **Manos:** mediana del descenso de cada mano desde su máximo ≥ 0,35 m ⇒ bajan 2 pisos; más rápido de 0,4 m/s cruje; soltar a
  mitad tira 2 pisos; tres seguidas = *carregat*. Muros sin torre al 50 % (`score.js:680-705`).
- **Nadie:** aviso a 5 s, **cae a los 10 s** (*carregat*) si quedan más de 2 pisos. **Fin:** 0 pisos (no antes del 30) o la red por
  reloj desde el 38.

### 2.8 Caída (12 s, sólo si cae) y acta (40 s)

- **Caída:** la torre se rompe; cartela «Ha caído · Quedan las brasas» desde t = 2. **Ninguna mano hace nada** (`fall3d.js` no lee
  manos). Golpe, `sfx-fall`.
- **Acta:** negro. 0,2–24,6 s «3 de 7» (mayúscula ≈ 0,46 m, centro a 2,46 m) y «descarregat»; glosa (≈ 6 cm); 4,5 s voz
  «Descarregat. Levantado, coronado y bajado sin caer.»; 3–15 s **«Dejad vuestra mano»** (≈ 8 cm a 1,18 m): cada mano quieta 0,5 s
  deja una huella dorada de ~26 cm (máx. 60) (`score.js:710-720`); 12–24,6 s «N manos · S s de quietud»; 24,5 s voz «Este ha sido
  vuestro castell. Cuando los cuerpos resuenan juntos, nace la cultura.»; 25–32,6 s frase final; 33,5–39,6 s créditos. Vuelve a la
  espera.

---

## 3. Auditoría de interacción

Leyenda: **< 100 ms** = respuesta inmediata (el sonido recibe el `down` al instante; la imagen recibe la mano 150 ms tarde por el
runtime, ~200–250 ms con proyector: **ninguna respuesta visual cumple 100 ms**, sólo la sonora). **Leg.** = legibilidad 1–5 (¿sabe
el visitante qué hacer y qué provocó?). Estimación mía desde el código; hay que confirmarla en la sala.

### 3.1 Tabla de gestos

| # | Gesto (bloque) | Disparo y umbrales | < 100 ms | Consecuencia | Cómo se aprende | Leg. | Solo | Grupo | Modos de fallo |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Tocar (espera) | aterrizaje, cualquier sitio | sonido sí; imagen ~200 ms: ola de 7 m, 9–13 piezas caen | revela el anillo de inicio (banco, ≤ 0,055/s) | texto a 2,12 m; voz sólo tras marcharse | 4 | sí (~50 s sostenido) | sí | 10 manos: el pago está topado, bien. Lo que cae es < 0,3 m sobre fondo igual de texturado |
| 2 | Sostener el anillo (espera) | mano a ≤ 0,55 m del centro del muro, cualquier altura; 3 s (2 manos) / 4,5 s (1) | anillo «hot» sólo entre 0,5 y 2,0 m (`guide3d.js:365`) | empieza el pase | texto + voz «Sostened el anillo…» | 4 | sí | sí | niño < 0,5 m: llena sin encender. Pérdida LiDAR: decae a media velocidad, tolerante |
| 3 | Encender un farol (intro) | aterrizaje, 1 cada 0,25 s por muro | sí (sonido) | un farol a 8–10 m se enciende ~30 % más | nadie lo dice | **1** | — | — | no cuenta para nada; después del segundo 46, nada |
| 4 | Chispa (Brasa 0–12 s) | aterrizaje / mantener / arrastrar | sí; chorro ~780 chispas en 0,6 s, altura según la mano; un diable de ~0,5 m | ninguna (reloj) | «Tocad el muro» + voz | 3 | sí | sí (tope 4/n) | es **exactamente** «manos haciendo partículas» |
| 5 | Pasar el fuego (Brasa) | mano por delante del diable a ≤ 2,5 m, en sentido +s; salta al llegar a 15 cm | no (el diable tarda en llegar) | una vuelta ⇒ empiezan las llamadas | sólo «Pasad el fuego»; **sin voz, sin flecha de sentido** | **2** | difícil: una persona debe caminar 27,6 m por delante a 1,2 m/s; si no, 6 s parado y lo llevan | sí: es el mejor juego de grupo de la obra | costura: bien (perímetro continuo). Una mano **detrás** del diable no hace nada y nadie lo explica |
| 6 | La llamada (Brasa, ressonància) | aterrizar entre el primer tok y TOK + 0,7 s; ½ por mano apoyada «reciente»; quórum 40 % (2–5; 1 solo) | sí (sonido) | ola grande / un florecimiento mayor | «Con el tambor», anillo que se contrae, mano fantasma; voz «Ahora, todos a la vez» (sólo Brasa) | 3 | sí (quórum 1) | sí | LiDAR: un rebote corto se cose al mismo trazo (no es aterrizaje); P3 (plano a 12 cm) peor. La imagen llega 200 ms tarde respecto al timbal |
| 7 | Palma con palma (Pinya) | aterrizaje | sí; sale una figura y apoya la palma (0,9 s); haz de ~30 fibras | la figura guía hacia el centro | voz «Alguien espera vuestra mano» | 3 | sí | sí hasta 18 palmas | la figura mide ~0,9 m en el muro y está hecha de puntos: no se lee como «alguien» |
| 8 | Juntarse (Pinya) | ≥ 80 % de las manos del muro en 2 m, a ≤ 1,8 m del centro; llenar 10 s; sostener 3 s | no (continuo) | cierra el círculo; **fija la estructura** del resto de la obra | «Juntaos» + voz «Juntaos. Hombro con hombro» | 3 | sí (1 muro = *pilar*) | sí | **grupo en una esquina: `pack` = 0** (la esquina está a 3,2–3,7 m del centro; cada muro cuenta por separado). Oclusión hombro con hombro: el sensor verá menos manos, y eso aquí ayuda |
| 9 | Levantar (Tronc) | subir ≥ 0,33 m en una frase de 4,8 s | no | piso encaja con su nombre | «Levantad», mano fantasma con la frase, banda de hombros; voz al empezar | 3 | sí | sí | trazo perdido a media subida: la base se recalcula y la subida se pierde. Niño: 0,33 m repetidos caben justo en 0,6–1,4 m. Pisos 5–9 llegan casi igual sin gesto |
| 10 | Nivelar (Tronc) | manos a ambos lados del centro; diferencia de alturas / 0,4 | no | la torre se inclina 7° y suelta piezas | dos anillos; pista de voz | 2 | **no**: con un solo lado, inclinación total (`score.js:449`); una persona necesita las dos manos a ± 0,65 m | sí | la causa (alturas distintas) no se explica |
| 11 | Sujetar la base (Tronc) | una mano < 0,95 m en el muro que tiembla, 1 s en 5 s | sí (la música se hunde) | salva un piso | texto + voz + mano fantasma hacia abajo | **4** | sí, si está en ese muro | sí | el muro que tiembla es aleatorio entre los de la estructura; con 2 personas en otro muro hay que cruzar 7 m en 5 s |
| 12 | Quieta: relevo (Pom) | mano que se mueve < 15 cm/s; lista tras 1 s | no | la luz vuela entre manos con hilo de oro | «Quietos»; voz «Quietos. Llevad su luz.» | 3 | entre las dos manos de una persona | sí, lo mejor del Pom | **no acelera nada** (38 s fijos). Temblor del S2E en una mano quieta: sin medir (umbral 0,15 m) |
| 13 | Quietas: aliento y silencio (Pom) | todas quietas; racha > 0,35 m | no | sube más rápido / un movimiento cuesta 6 % | «Contened el aliento»; el silencio no tiene palabras | 3 | sí | frágil con 10: una sola persona que entra o se va frena a todos | quien llega tarde o se apoya rompe el silencio sin saberlo |
| 14 | Alzar la mano (aleta) | subir ≥ 0,28 m, o > 1,6 m tras 2 s; quórum 60 % en 2 s | no; rayo de oro de la mano al techo | corona antes y más ancha | **sólo voz**, que termina hacia el 5,5 de 10 s; manos fantasma | **4** (es el gesto más claro) | sí | sí | trazo perdido al alzar: la base se reinicia arriba y ya no cuenta salvo > 1,6 m. **Niño: no llega a 1,6 m y debe subir 28 cm desde donde esté: bien**. Sombras con muchas manos arriba |
| 15 | Onda libre (ressonància) | aterrizaje | sí; anillo que recorre metros | suma resonancia | cartela «La plaza es vuestra» | 4 | sí | sí (se atenúa 1/√n) | sobre un fondo ya agitado y dorado, el anillo propio se pierde |
| 16 | Devolver el eco | aterrizar en el muro de llegada a ± 0,7 s | sí (sonido) | rebota doblado, una octava arriba | **nada de texto ni voz**; sólo la mano fantasma 0,8 s antes | **2** | sí (vuelve a su muro) | confuso: hasta 12 frentes en la partitura, 4 dibujados | con el mapa real, P2 y P3 suenan por el mismo canal: el «muro de enfrente» de P1 (P3) no se distingue de P2 |
| 17 | Bajar (bajada) | descender ≥ 0,35 m desde el máximo, < 0,4 m/s | no | bajan 2 pisos; esquirlas, flores de vidrio de 30–45 cm donde se recogen | «Bajadlo despacio», mano fantasma sube y baja; voz | 3 | sí | sí | la banda visual pide ≥ 1,4 m para «cogerla» (según `baixada3d.js`, sin verificar a fondo): un niño no llega. Trazo perdido: el máximo se pierde. 10 s sin manos = caída |
| 18 | Dejar la huella (acta) | mano quieta 0,5 s entre los segundos 3 y 15 | no | huella de oro que se queda | texto de 8 cm a 1,18 m; **sin voz** | 3 | sí | sí (60) | ventana de 12 s que coincide con la voz del resultado; quien lee arriba no toca abajo |

### 3.2 Lo que funciona como relato y lo que no

- **Funciona:** el anillo de inicio (compromiso claro), el temblor del Tronc (peligro → gesto → alivio, con música), l'aleta (la voz
  pide, el cuerpo responde, la sala corona), la huella del acta (rastro personal). Los cuatro tienen **causa visible, urgencia y
  resultado distinto**.
- **No funciona:** la chispa, el farol, la onda libre, los pétalos del Pom, las esquirlas de la bajada: efecto local sin
  consecuencia. Y el relevo del Pom, el eco y la nivelación: tienen regla, pero el visitante no puede descubrirla.
- **El público no cuenta la historia: la escucha.** La historia («los de abajo sostienen») sólo se dice en la intro. Después, en
  ningún bloque la sala le devuelve al grupo *qué castell está levantando* hasta el acta. La estructura elegida en la Pinya, el
  número de pisos, quién falla: no se nombran en vivo.

### 3.3 Sin agencia

Intro 70 s + premios 22,5 s + coronación 25 s + caída 12 s + la mayor parte del acta (28 de 40 s) ≈ **2 min 25 s de ~10** en los que
tocar no cambia nada; y otros ~3 min en los que la red por reloj hace lo mismo que el gesto (chispa de la Brasa, Tronc pasivo, Pom
desde el 90, bajada desde el 38).

### 3.4 Estado de las 28 correcciones del análisis anterior

| # | Asunto | Estado en 7a056a2 |
|---|---|---|
| 1–5 | Páginas de revisión (`review.html`, `sala3d.html`, público virtual, manos demo) | **No verificado**: no afectan a la sala. El integrador las excluye |
| 6 | Documentar la página donde se toca | Hecho (`lab/RESSONANCIA.md §1`) |
| 7 | La intro pedía tocar sin escuchar | Hecho: frase y voz retiradas (`introtext.js:5-6`, `sound.js:43`); faroles por mano (débil) |
| 8 | Cartelas que bloquean | Hecho (`score.js:332`) |
| 9 | La llamada ignora manos apoyadas | Hecho (`score.js:107-114`) |
| 10 | Una persona no puede acertar | Hecho (`S.solo`, `score.js:325-328, 373, 422, 636`) |
| 11 | Media sala muerta | Hecho en reglas (Pom en cualquier muro, bajada y Tronc al 50 %, «Ayudad desde aquí»). **Respuesta propia del Tronc en muros sin torre: sin verificar** |
| 12 | Bajada: copiar la mano fantasma no baja | Hecho (0,35 m; gesto `updown`; sin anillo) |
| 13 | Tronc: la frase sólo se oye | Hecho (gesto `phrase`, sin pulso, máximo durante subir + encajar) |
| 14 | Anillo de la espera con manos lejanas | Hecho (`guide3d.js:455, 483`) |
| 15 | Rayos de l'aleta con el trazo equivocado | Hecho (`pom3d.js:1372-1384`) |
| 16 | Pinya: zona estrecha, un muro no cierra | Hecho (1,8 / 3 m; un muro cierra; 18 palmas). **Queda la esquina** (fila 8) |
| 17 | Texto de la Pinya | Hecho («Juntaos», gesto `gather`) |
| 18 | Textos de la Brasa por temporizador | Hecho (`guide3d.js:45`) |
| 19 | Caídas sin aviso | Hecho (avisos a mitad de plazo; Pom 20 s; bajada 10 s; el Pom ya no cae por tiempo) |
| 20 | La respuesta local no distingue acierto de fallo | **No verificado; por lo leído, no** |
| 21 | Eco sin enseñanza | A medias: sale de la mano, mano fantasma, 4 frentes; **sigue sin texto ni voz** |
| 22 | Quietud y esquinas | Hecho (`score.js:91-93`) |
| 23 | Aleta: manos ya altas | Hecho (2 s, ventana 10 s) |
| 24 | Espera lenta para uno | Hecho (`soloRate`) |
| 25 | `GUION.md` desfasado | No verificado |
| 26 | **Dos instancias duplican `fx` y `ctl`** | **NO hecho**: Vicente lo deja como petición (`res-obra3d/NOTES.md:97-100`) |
| 27 | Identidad de trazo imagen/sonido | No hecho (petición al estudio); mitigado en l'aleta |
| 28 | Pliegue de duplicados en la partitura | Hecho (`score.js:271-298`) |

---

## 4. Auditoría de calidad visual por escena

Común a todo (`scenes3d/room3d.js`): un ojo fijo en el centro a 1,6 m, cuatro cámaras off-axis (`:49, 67-87`); tira HDR
half-float; post = bloom (0,5 × 0,6 = 0,3, umbral 0,85; `:347-349`) + ACES + grano 1,5/255; TAA sin reproyección en «high».
**No hay sombras, AO, profundidad de campo ni reflexiones de pantalla en ninguna escena** (búsqueda vacía). El horizonte queda al
43 % de la altura del muro. Lo que está «a d metros» del ojo se ve en el muro al factor ≈ 3,4/d: todo lo que vive a 6–12 m es
**pequeño**.

| Escena | Qué se renderiza | Qué se ve amateur y por qué |
|---|---|---|
| **Espera** `parts/umbral3d.js` | Malla Voronoi única con material físico por nodos (clearcoat, espejo, estado por pieza en textura, `:275-321`), dibujada dos veces (reflejo); 6 `InstancedMesh` de cerámica, espejo y vidrio iridiscente; 4 arcos dorados con tubo emisivo; 11 luces sin sombras (`:544-549`) | Es la escena más sólida. Pero: textura uniforme en 360° sin zonas de descanso ni jerarquía; cuatro puertas idénticas; brillos especulares quemados y «estrellitas»; hilos de los móviles como arañazos; color revelado plano y saturado (se lee *low-poly*, no cerámica); tercio inferior negro; el arco con borde de neón parece un contorno de interfaz (capturas `umbral3d/shots/f-01`, `f-06`, `f-09`) |
| **Intro** `plaza.js`, `atmos.js`, `castell.js`, `introtext.js` | Plaza procedural de extrusiones y cilindros, 6 materiales estándar con ruido por píxel y bucle de 16 faroles en el *shader*; 300 000 motas de polvo; castell de partículas a 8,5 m | Fachadas azul-gris de bajo contraste; faroles como bolas blancas quemadas por bloom + ACES; la línea ámbar de horizonte a 1,25 m se lee como guía gráfica, no como mundo; polvo uniforme «nieve»; no cabe cielo; al romperse, las losas del tercio superior parecen hojas de papel (`estudio/album/02-intro.png`, `vis2/t056-sheet.jpg`). Es correcta y anodina: 70 s de un decorado que no es el de la obra |
| **Brasa** `brasa3d.js` | Lecho de brasas radial (campo de calor 1D), 36 000 llamas, 131 072 chispas en GPU, hasta 14 diables de ~4 500 partículas, 2 400 teselas, 4 pebeteros; todo `MeshBasic` aditivo con espejo duplicado | **Composición en franja:** todo ocurre en el 20–25 % inferior; el 60–70 % superior es negro con ruido de estrellas. Diables = muñecos de palitos de fuego de ~0,5 m. La «fuente» de chispas es una bola de puntos (diente de león). Pebeteros opacos como peones de ajedrez, sin luz de relieve, repetidos ×4. Es el capítulo que más se parece a la queja del director (`vis2/t056-sheet.jpg`) |
| **Pinya** `pinya3d.js`, `pinya3d/body.js` | 458 cuerpos SDF bien construidos (esqueleto, IK, 3 poses)… **dibujados como nube de 1 600 puntos cada uno** (~733 000 puntos, `:61, 346`); fibras; cubos de alambre y teselas; sin luces | Multitud de clones en la misma pose y en filas; figuras de ~0,9 m (un adulto frente a muñecos a media escala); ni nube ni sólido: volumen granulado sin rasgos; 40 % superior negro; el anillo y el icono de mano son lo más brillante y lo más «UI». El concepto (te cogen la mano y cargan su peso en ti) es el más fuerte de la obra y la imagen no lo sostiene (`album/04-pinya.png`, `notas/luz/t053-pinya.jpg`) |
| **Tronc** `tronc3d.js`, `tronc3d/sculpt.js` | Torre de cuerpos SDF mallados (elipsoides y conos fundidos), porcelana mate con iluminación escrita a mano, fajas de trencadís procedural, granos; a 6,5 m, escala × 2,5; cielo casi negro | **Sin captura actual.** Por código: figuras sin manos, cara ni ropa (riesgo alto de «bultos blandos»); un solo material sin vidriado ni desgaste; sin sombra entre pisos ni suelo: objeto flotando en vacío; cuatro torres idénticas con la misma luz. El pincel de la mano (≈ 40 cm de granos) es partícula |
| **Pom** `pom3d.js` | Cajas instanciadas con líneas de ~1,1 px dibujadas en el *shader* (`:54-70`), niebla exponencial, hilos, 1 300 fichas físicas iridiscentes, jardines | Wireframe blanco sobre negro: legible, pero estética «Tron / CAD» ajena al resto; rascacielos = cajas con rejilla; halos de mano = dos cuadrados blancos quemados; líneas de 1 px ≈ 4 mm en el muro: riesgo de *aliasing* y de desaparecer en proyección. L'aleta (rayos de oro de 3 m) es la mejor imagen interactiva |
| **Coronación / ressonància** `festa3d.js` | Ecuación de ondas 2D en GPU (830 × 115) que ilumina una placa dorada; 600 000 partículas de arena; 52 esferas de cromo | Textura procedural hermosa e indiferenciada: sin héroe, sin oscuros, rango dinámico estrecho, patrón casi caleidoscópico idéntico en cada muro; la arena se lee como ruido de vídeo; las esferas (~0,3 m) casi no existen. **La coronación del castell no muestra un castell** |
| **Bajada** `baixada3d.js` | Domo de amanecer en gradiente; plaza en silueta; 5 200 esquirlas planas con alfa (el comentario promete vidrio físico, `:209`; el material es `MeshBasic`, `:221`); flores | El único cielo bonito de la obra, con siluetas negras planas de cartulina delante, sin bruma ni capas; la torre de vidrio es confeti; destello blanco plano |
| **Caída** `fall3d.js` | La torre del Tronc que se desmorona, 660 esquirlas extruidas, polvo, chispas | Sin captura actual; en las antiguas, recortes grises sin materia ni apilamiento. Sin manos: 12 s de vídeo |
| **Acta** `actatext.js`, `typo3d.js` | Tipografía SDF (Instrument Serif, Geist) que se arma con teselas; huellas | Tipográficamente es lo más elegante. Problemas de tamaño y altura (§5) |

**Causas transversales, por orden de peso:**
1. **Sin luz ni sombra reales:** nada pesa ni se apoya. Emisivo + bloom + ACES = blancos quemados y halos.
2. **Escala y distancia:** lo humano está lejos y pequeño; el primer plano (0–2 m tras el muro) está vacío.
3. **Composición:** la acción vive en una franja; la mitad alta de 3,75 m se desperdicia; simetría × 4 sin muro protagonista.
4. **Ocho lenguajes visuales** sin materia común (el «trencadís» sólo es verdad en la espera y en las transiciones).
5. **Figura humana sin resolver** en una obra sobre cuerpos: puntos, palitos de fuego, elipsoides.
6. **La guía se ve como interfaz** (anillos, reglas con «1,25 m», «P4», etiquetas mono; `guide3d.js:293-346`): metadatos de
   laboratorio proyectados en la obra.

---

## 5. Auditoría de voz y texto

### 5.1 Voz

| Pregunta | Respuesta |
|---|---|
| ¿Dice dónde mirar? | **Nunca.** Va por `roomInput` (todos los muros igual, `sound.js:157`) y ningún texto nombra un muro ni una dirección. La llamada «de un muro al opuesto», el muro que tiembla, la luz que salta, el eco: todo espacial, nada señalado |
| ¿Dice qué hacer? | Sí en 7 momentos, bien y breve: «Tocad el muro», «Juntaos. Hombro con hombro», «Ahora, levantad…», «Tiembla. Sujetad la base», «Quietos. Llevad su luz», «Levantad la vuestra», «Despacio. Piso a piso». **Falta** en: relevo de la Brasa, nivelar (sólo pista), aliento y silencio del Pom, eco, llamada final, huella del acta |
| ¿Dice qué está pasando? | Sólo al cerrar («El círculo se ha cerrado», «El castell está coronado») y en el acta. **Nunca** celebra un piso, un relevo, una ola; nunca nombra lo que el grupo acaba de conseguir |
| ¿En el momento justo? | Las de cartela sí (inicio de bloque). «Quietos. Llevad su luz» llega cuando acaba la cartela (6 s) mientras la primera subida ya corre desde t = 0. «Levantad la vuestra» acaba hacia el segundo 5,5 de una ventana de 10. «Alguien espera vuestra mano» es poética, no es consigna. La pista `again` («Otra vez. Juntos.») existe y la partitura actual no la emite |
| Tono | Susurrado e íntimo (*hushed*, *whispers*) en todas las líneas: no hay cambio de energía entre el silencio del Pom y la fiesta |
| Idioma | Español peninsular («vosotros»), palabras castelleras en catalán; inglés en el selector (`ressonancia-sound/manifest.json`). El texto de los muros **no** cambia con el idioma de la voz |
| Reglas de reproducción | Una línea no se repite en el pase (`sound.js:203-208`); las pistas son «educadas» (se descartan si alguien habla) y como mucho una cada 25 s (`score.js:126`): un grupo perdido puede pasar un bloque entero sin ayuda hablada |
| Restos | 6 líneas grabadas y silenciadas siguen en disco; las transcripciones del inglés en los comentarios no coinciden con el español en duración |

### 5.2 Texto en los muros

| Texto | Altura del centro | Mayúscula aprox. | Juicio (lectura cómoda 1,2–2,2 m; visitante a 1–3 m del muro) |
|---|---|---|---|
| Cartela de capítulo | **2,68 m** (`guide3d.js:277`) | 0,31 m (nombre) | Fuera de la franja: hay que levantar la cabeza; a 1 m del muro es incómodo. 4 s. Idéntica en 4 muros |
| Consigna | 1,98 m (2,12 espera; 2,30 Tronc y bajada) | **0,10 m** | Legible a 3 m, pequeña para ser LA orden; a 2,30 m queda sobre las cabezas. Se atenúa 55 % cuando «ya lo hacen» |
| Etiqueta (piso, enxaneta) | bajo la consigna | 0,06 m al 60 % | Al límite; ilegible para quien está lejos |
| Capa gráfica fina («I · BRASA», «P4», «1,25 m», «0,90», «1,60», reglas, «+») | 0,5–2,42 m, a 22 cm de cada borde | 0,056 m | **Metadatos de laboratorio en la obra**; ruido. Quitar |
| «Ayudad desde aquí» | 1,98–2,30 m | 0,10 m | No dice cómo |
| Lema de la intro | 2,0 m | 0,35 m | Bien: único uso del espacio (un muro tras otro) |
| Acta «3 de 7» | 2,46 m | 0,46 m | Legible; alto |
| Acta: glosa, contador, «Dejad vuestra mano» | 1,66 / 1,18 / 1,18 m | 0,06–0,08 m | **Demasiado pequeño** para una instrucción con ventana de 12 s |

**Hacia qué muro:** todas las consignas salen centradas en los cuatro (o en los de la estructura). En una sala de 360° eso obliga a
que el texto esté donde está cada persona, pero impide dirigir: no hay muro «frontal». El perfil sí define uno
(`profiles/xrlab.json › audio.media.front = P1`) y la obra no lo usa.
**Animación:** enfoque palabra a palabra y rotura en teselas: elegante y coherente. No hay animación que **señale** (un texto que
viaje hacia el muro que llama, una palabra que suba con las manos, un contador diegético de pisos).

---

## 6. Riesgos técnicos

### 6.1 Rendimiento y salida

- **WebGPU con el lienzo como fuente** (`res-obra3d/experience.js:560`: `vt.loop(frame, canvas)`). Con Spout por GPU
  (`spout-gpu`) la app toma los fotogramas de la ventana y no hay lectura (`experiences/runtime.js:146-147`). **Si ese camino
  falla**, el respaldo para un lienzo WebGPU es `drawImage` + `getImageData` de 7196 × 912 por fotograma
  (`runtime.js:124-131, 159`): inviable. Vigilar `Spout GPU path failed` en `engine.log`. El parámetro `renderer: webgl2` existe;
  en WebGL2 el anfitrión sigue pasando el lienzo, no el contexto, así que el respaldo sería igual de lento.
- **Dos instancias:** sala (escala 1, TAA, MSAA 2) + visor (≤ 0,5 ×, 30 fps), cada una con su `WebGPURenderer`, sus 600 000
  partículas de arena, sus 733 000 puntos de la Pinya y su cómputo de 131 072 chispas. El visor no recibe una calidad menor: la
  misma página, el mismo parámetro `quality`.
- **`quality` sólo cambia la escala de render (0,6 / 0,8 / 1) y la densidad de `castell` y `pinya3d`** (`experience.js:46, 72-73`).
  Brasa, atmos, festa, Pom y umbral no tienen modo ligero.
- **Mediciones existentes:** sólo en un MacBook M1 Max: Brasa 49 fps-eq en calidad **media**, bajada 65; alta 48–88
  (`lab/RESSONANCIA.md §7`). Ninguna en Windows ni en la GPU de la sala. Tirones de 60–77 ms al cambiar de capítulo (el último
  commit los reduce; sin medir en la sala).
- **Arranque:** ~15 s en negro compilando todas las partes (`experience.js:99-102`). `Quality`, `Renderer` y `Mode` exigen Stop +
  Play.
- CPU: bucle por pieza en la espera (`umbral3d.js:858-900`), *ray-march* en JS por mano en el Tronc (`tronc3d.js:392-410`),
  `postMessage` del estado completo cada 25 ms.

### 6.2 Canal imagen ↔ sonido (BroadcastChannel)

- **Manda el sonido** (`sound.js:1114-1135`, cada 25 ms); la imagen copia el estado si llegó en los últimos 700 ms
  (`experience.js:108-113, 409-413`) y, si no, corre su propia partitura con las manos retrasadas 150 ms. Las ventanas de audio y
  de salida tienen `backgroundThrottling: false` (`app/main.js:181, 206, 465`), así que el temporizador no se estrangula.
- **Hay que comprobar en la app** que la ventana de audio y la de salida comparten origen y partición: si no, el canal no llega y
  cada pieza corre sola, con **azar distinto** (muro que llama, muro que tiembla: `score.js:371, 508`) ⇒ imagen y sonido
  discrepan. Prueba de 10 s en `lab/PRUEBA-SALA.md §2.3`.
- **Duplicados del visor — sin arreglar.** No hay ninguna referencia a `vt.sink` en `res-obra3d`, `ressonancia` ni
  `ressonancia-sound`. Las ocho partes abren su canal y mandan `fx:impact` (`umbral3d.js:553`, `brasa3d.js:1255`,
  `pinya3d.js:743`, `tronc3d.js:378`, `pom3d.js:1011`, `festa3d.js:85`, `baixada3d.js:449`, `fall3d.js:166`), con tope de 16/s
  **por instancia**; el sonido los toca sin deduplicar (`sound.js:1110`). Además las dos instancias mandan `ctl` cada segundo y
  cada «Go to» dos veces (`experience.js:118, 411`). Y las simulaciones locales usan `Math.random` (43 usos en las partes): sala y
  visor no generan los mismos impactos, así que no son ecos exactos sino **golpes fantasma**.
  Arreglo: una guardia en el anfitrión y una función `fx` compartida que no publique si `vt.sink === 'viewer'`.
- **Identidad de trazo** distinta en imagen y sonido: mitigada (l'aleta ya no cruza por `stroke`); el relevo del Pom y de la Brasa
  publican posiciones, no ids. Vigilar que la luz se dibuje bajo la mano correcta.

### 6.3 Parche de umbrales del sonido (TUN.md)

`lab/estudio/notas/TUN.md` lo da por «SIN APLICAR», pero **está aplicado**: `sound.js:31` importa `applyTimes` y `sound.js:1110`
aplica `ctl.times`. El aviso de `lab/PRUEBA-SALA.md §2` ya no procede. Queda un matiz: los umbrales viajan sólo si la página visual
está abierta (los reenvía cada 1 s), y lo hacen las dos instancias.

### 6.4 Audio en la sala real

- Mapa real (`profiles/xrlab.json › audio`): P4 → 1, P1 → 3, **P2 y P3 → 2**, sin sub, `master 0,3`. La obra reparte el estéreo de
  la música «L a muros pares, R a impares» (`sound.js:134`): P2 (L) y P3 (R) se suman en mono en el canal 2. La llamada «un muro y
  su opuesto» (P4 ↔ P2, P1 ↔ P3), el eco y la campana del relevo pierden localización justo en esa pareja.
- La pieza filtra muros y sala con un pasa-altos de 4.º orden a 120 Hz (`sound.js:123-127`) y manda los graves aparte al sub
  (`:125`); sin canal de sub el anfitrión los pliega a los muros (`experiences/SOUND-API.md:34`). Hay que **escuchar** si el grave
  queda delgado: los stems «son sobre todo sub» según su propio comentario.
- Nadie ha oído la obra con la imagen (`lab/RESSONANCIA.md §7`). Niveles medidos sólo en la sala simulada.

### 6.5 App frente al arnés

- **Altura:** el arnés usa 3,75 m; el perfil real dice 3,5 m. Todo lo absoluto (anillo a 1,25, base < 0,95, aleta > 1,6, banda a
  1,6) depende de que `w.height` sea la altura real de la imagen. Corregir el perfil antes de afinar nada.
- **«Go to» se guarda en el perfil:** si queda en un bloque, la obra arranca ahí.
- **Máscaras de muro** (puertas, lámparas): el arnés no las tiene; el anillo de inicio y las dianas están en el centro del muro a
  1,25 m. Comprobar que ningún centro cae en una máscara.
- **Catálogo:** las carpetas de apoyo aparecen como experiencias lanzables («Ressonància», «3D study», «assembly»): riesgo de
  lanzar la equivocada. `res-obra3d/manifest.json` tiene **65 parámetros** (el contrato dice ≤ 64; lo desconocido se recorta o se
  ignora: comprobar cuál se pierde) y la descripción menciona universos que ya no existen.
- Modo sala: con `?run=1` se ignoran los interruptores de URL del laboratorio (`experience.js:38-45`): bien.

### 6.6 Carpetas, tamaños e importaciones

| Carpeta | Tamaño | ¿Necesaria en la sala? |
|---|---|---|
| `res-obra3d` | 0,1 MB | Sí (la pieza) |
| `ressonancia` | 55 MB (texturas 21 MB, three r187 8,3 MB, **23 MB de capturas en `parts/umbral3d/shots`**, escenas 2D antiguas) | Sí; sin `shots` (el integrador ya las quita) |
| `res-3d-study` | < 0,1 MB | **Sí, y falla en silencio si falta** (valores por defecto de cada parte, `experience.js:67-69`) |
| `ressonancia-sound` | 22 MB, 104 mp3 (los dos idiomas) | Sí. Copias idénticas de `score.js` y `tuning.js` (comprobado con `cmp`): **cada cambio de regla va en las dos** |
| `res-obra` | < 0,1 MB | **No para la obra 3D**: sólo la usan `review.html` y `sala3d.html` (que el integrador excluye) y es el «plan B» en 2D, que a su vez importa `ressonancia/scenes/*.js`. `lab/PRUEBA-SALA.md` pide cinco carpetas; `docs/plans/INTEGRAR-RESSONANCIA.md` cuatro. Decidir si se lleva el plan B |

Ningún archivo pasa de 2,4 MB. `exists()` hace un `HEAD` por parte y por JSON al cargar (`experience.js:60`): depende de que el
servidor del motor responda a `HEAD` en esas rutas (ya probado con 6491dd9 según el plan de integración).

---

## 7. Los 15 problemas, por impacto en el estreno

| # | Problema | Evidencia | Dirección de arreglo |
|---|---|---|---|
| 1 | **El gesto no cambia el relato:** todo acaba igual por reloj | `score.js:393, 428, 516, 591-600, 667-676, 704` | Hacer visibles dos finales por bloque y nombrarlos en vivo (voz + texto): pisos conseguidos, olas, relevos. Retrasar las redes y que la ayuda sea **visible y nombrada** («la colla os ayuda»). Que la estructura de la Pinya y los pisos del Tronc se vean heredados en Pom, coronación y bajada |
| 2 | **La respuesta a la mano es partícula pequeña y lejana** | §4; diables 0,5 m, cuerpos 0,9 m, teselas < 0,3 m | Una respuesta de escala humana en el plano del muro por bloque (≥ 1 m, persistente 10–60 s, visible a 3 m): la silueta de luz de quien toca, la huella que se queda, la banda que se agarra. Traer lo humano a 0,3–2 m tras el muro |
| 3 | **Duplicados del visor en el sonido** | §6.2; sin `vt.sink` en ningún archivo | Guardia en el anfitrión y en el `fx` de las ocho partes: no publicar si `vt.sink === 'viewer'`. Media hora; imprescindible |
| 4 | **La voz no dirige** (ni dónde, ni qué pasa) y faltan líneas | §5.1; `sound.js:51-52, 157` | Reescribir el guion de voz como regidora: 1 línea de tarea + 1 de confirmación por fase; grabar las que faltan (relevo, nivelar, aliento, silencio, eco, llamada final, huella). Encaminar las consignas espaciales por `wallInput` del muro que llama. Variar la energía |
| 5 | **Texto pequeño, alto, idéntico ×4 y con metadatos de laboratorio** | §5.2; `guide3d.js:77, 277, 280, 293-346, 531` | Consigna a 1,5–1,7 m con mayúscula ≥ 0,18 m; cartela centrada a ≤ 2,1 m; quitar reglas, «P4», «1,25 m»; texto que **señala** (aparece primero en el muro que llama, viaja con el relevo); instrucción del acta grande |
| 6 | **Intro de 70 s sin tarea** tras enseñar a tocar | `score.js:351-357`; §2.1 | Recortar a ~35–40 s o darle una tarea real (encender la plaza entre todos, con consecuencia visible); llevar parte del relato a los bloques |
| 7 | **Composición: media altura en negro, simetría ×4, sin héroe** | §4 (Brasa, Pinya, Tronc, festa) | Un muro protagonista por momento (usar el `front` del perfil y el muro que llama); llenar 2–3,75 m con cielo, humo, arquitectura o la torre creciendo; romper la repetición |
| 8 | **Sin luz ni sombra; emisivo + bloom quemado** | `room3d.js:341-358`; sin `castShadow` | Etalonaje por bloque, bajar emisivos por debajo del umbral, sombra de contacto y oclusión falsas y baratas donde algo se apoya, niebla de profundidad; *dither* más fuerte en negros para el proyector |
| 9 | **Figura humana sin resolver** (puntos, palitos, elipsoides) en una obra de cuerpos | `pinya3d.js:61, 346`; `tronc3d/sculpt.js`; `brasa3d.js` | Decidir **un** tratamiento del cuerpo para toda la obra y a escala ≥ 1,5 m aparente. Las mallas SDF de `pinya3d/body.js` ya existen: dibujarlas como superficie con el material de trencadís |
| 10 | **Relevo de la Brasa y eco/llamada de la ressonància sin enseñanza** | `guide3d.js:45, 53`; sin líneas de voz; sentido único `score.js:211-216` | Brasa: flecha/estela que muestre el sentido, voz «Pasadlo. De mano en mano», aceptar manos por ambos lados. Eco: voz + texto en el muro de llegada («Devolvedla»), un solo frente a la vez con 1–4 personas |
| 11 | **El Pom premia igual hacer que no hacer; el relevo es decorado** | `score.js:566, 596` | Que cada relevo dé un tramo visible de subida y que moverse haga bajar a la vista; el silencio debe poder **fallar a la vista** (sin caer): hoy 6 % es invisible |
| 12 | **Ocho lenguajes visuales; la coronación no muestra el castell** | §4; `festa3d.js` | Materia común (trencadís + cuerpo) en todos los bloques; en la coronación, el castell del grupo (su estructura, sus pisos) presente y coronado antes de fundirse en oro |
| 13 | **Rendimiento sin medir en la máquina real y sin modo ligero** | §6.1 | Medir esta noche a escala 1 en Windows con la app (sala + visor); visor con calidad baja forzada; `quality` que recorte partículas en Brasa, atmos, festa; plan B decidido (calidad media / 2D) |
| 14 | **Audio real: P2 y P3 comparten canal; grave sin sub; nunca oída con imagen** | §6.4 | Escucha completa en la sala; mono compatible para la pareja P2/P3 (la llamada «opuesta» apoyada en imagen, no en sonido); revisar el pasa-altos de 120 Hz sin sub; subir la voz |
| 15 | **Fallos de borde:** grupo en una esquina no llena la Pinya; nivelar imposible con una mano; trazo perdido = gesto perdido; niño y la banda a 1,6 m; altura del perfil 3,5 vs 3,75 | `score.js:407, 449, 475-481, 613, 690`; §6.5 | Ventana de la Pinya sobre el perímetro continuo, no por muro; nivelar sólo con ≥ 2 manos en el muro; heredar base y máximo al trazo nuevo que aparece a < 0,4 m; banda a la altura de las manos presentes; corregir la altura en el perfil |

**Orden sugerido para esta noche:** 3 (media hora, evita un fallo audible) → 13 y la altura del perfil (medir antes de decidir
nada) → regenerar el álbum con el código actual → 5 y 4 (texto y voz: lo que más cambia la claridad por hora invertida) → 1 y 10
(consecuencia y enseñanza, dentro de la partitura que ya existe) → 2, 7, 8 (imagen) según las horas que queden; 9 y 12 son las de
mayor alcance y probablemente no caben enteras antes de las 10:00.

---

## 8. Lo que no he podido verificar

- El aspecto real de cualquier escena en movimiento, y en particular el Tronc y la caída actuales (sin capturas).
- Fps en Windows / GPU de la sala; coste real de las dos instancias.
- Que el `BroadcastChannel` llegue entre la ventana de audio y la de salida en la app empaquetada.
- La respuesta del Tronc en muros sin torre, y el umbral de 1,4 m de la banda de la bajada (leído por delegación, no por mí).
- Temblor de una mano quieta en el S2E frente al umbral de 0,15 m; estabilidad de la altura a 10 Hz; oclusiones en fila.
- Cuál de los 65 parámetros del manifiesto se pierde, si alguno.
- Las páginas de revisión del laboratorio (correcciones 1–5) y `GUION.md`.
