# Catálogo del laboratorio

Índice de experimentos. **Se actualiza cada vez que cambia el estado de uno.** Las reglas, los estados y el formato de `NOTES.md` están en
`lab/CLAUDE.md` (§10 y §11).

Estados: `idea` → `prototype` → `runtime-ready` → `under review` → `approved` → `tested in app` → `integrated` · además `parked`, `rejected`
y `template`. Fase: *prototipo* = una página suelta en el navegador · *runtime-ready* = corre en la app con `vt` · *sound* = pieza de sonido.

## Experimentos

| Id | Nombre | Tipo | Fase | Estado | Autor | Dónde | Notas |
|---|---|---|---|---|---|---|---|
| `water-ripples` | Water / ripples | visual+sound | prototipo | **approved** (interactividad aprobada por el director) | estudio | [`docs/proposals/water-ripples/`](../docs/proposals/water-ripples/index.html) · variante [`index-riverbed.html`](../docs/proposals/water-ripples/index-riverbed.html) | Ondas y notas: la x da el tono (4 octavas), la y el brillo y la caída; la superficie envuelve P3→P4. Tres «looks» (cáusticas, líneas cimáticas, líquido profundo). Capturas `look1–3.png`. |
| `threads` | Threads | visual+sound | prototipo | **under review** | estudio | [`docs/proposals/threads/`](../docs/proposals/threads/index.html) | Dos manos tejen un hilo con una nota arqueada; la longitud da el tono (3 octavas, intonación justa); entre muros se hace más grave y añade una quinta. Al soltar: punteo, destello y disolución. |
| `breathe` | Breathe | visual+sound | prototipo | **under review** | estudio | [`docs/proposals/breathe/`](../docs/proposals/breathe/index.html) | Respiración de 4 s / 6 s; apoyar la mano 0,6 s despierta una piedra de 80 cm a 1,0–1,6 m; si todos los muros tienen una piedra despierta, el acorde florece y la sala pasa a la luz siguiente (alba, día, ocaso, noche). |
| `aurora` | Aurora | visual+sound | prototipo | **under review** | estudio | [`docs/proposals/aurora/`](../docs/proposals/aurora/index.html) | Doce piedras de acorde (tres por muro, 1,1–1,4 m); bucle dórico Dm9 · Fmaj7 · Cadd9 · Gadd9; arrastrar por el cielo da viento y campanas; con piedras en 3 o más muros, el cielo se corona. |
| `ressonancia` | Ressonància | visual | runtime | **prototype** | Vicente | [`experiments/ressonancia/`](experiments/ressonancia/) | Castell de luz para XR Lab, obra guiada de ~10 min para 2–15 personas. Aquí viven el guion (`GUION.md`), el director (`score.js`) y los universos (`scenes/`). La página propia es el primer estudio del trencadís; la obra entera se ve en `res-obra`. |
| `ressonancia-sound` | Ressonància — sound | sound | runtime | **prototype** | Vicente | [`experiments/ressonancia-sound/`](experiments/ressonancia-sound/) | El sonido de la obra entera, rediseñado: contemporáneo y cinematográfico, un mundo por capítulo, música por capas que sigue al grupo, gralla y timbal como materia granulada, voz íntima en inglés (Lily) y en español de España (Mía Evans), ElevenLabs v4; parámetro de idioma. 61 archivos generados con ElevenLabs (19 MB; excepción a «sin samples», pendiente de confirmar por el estudio). Nadie lo ha escuchado todavía. |
| `res-obra` | Ressonància — obra entera | visual (+ `ressonancia-sound`) | runtime | **prototype** | Vicente | [`experiments/res-obra/`](experiments/res-obra/) | La obra montada: el director recorre el pase y cada bloque muestra su universo, con botones de mano y texto de guía. Un pase completo corre sin errores. Para verla sola con público virtual: `simulate.html`; con la intro 3D: `review.html`. |
| `res-intro` | Ressonància — estudio: Intro | visual | runtime | **prototype** | Vicente | [`experiments/res-intro/`](experiments/res-intro/) | La plaça, 70 s: polvo, línea de horizonte, torre humana de puntos de luz, lema y título. |
| `res-fire` | Ressonància — estudio: Fuego | visual | runtime | **prototype** | Vicente | [`experiments/res-fire/`](experiments/res-fire/) | Brasa: línea de brasas, chispas de correfoc, olas de fuego; transición a cuatro hogares. |
| `res-earth` | Ressonància — estudio: Cuerpo y tierra | visual | runtime | **prototype** | Vicente | [`experiments/res-earth/`](experiments/res-earth/) | Pinya: arcilla que guarda la huella, anillos de manos, banda que gira; se cuartea en trencadís. |
| `res-stone` | Ressonància — estudio: Piedra | visual | runtime | **prototype** | Vicente | [`experiments/res-stone/`](experiments/res-stone/) | Tronc, coronación y bajada: el trencadís por pisos, inclinación, oro, caída. |
| `res-night` | Ressonància — estudio: Aire y noche | visual | runtime | **prototype** | Vicente | [`experiments/res-night/`](experiments/res-night/) | Pom de dalt: cielo, tres luces de oro que suben en espiral, manos como constelaciones. |
| `res-festa` | Ressonància — estudio: Ressonància | visual | runtime | **prototype** | Vicente | [`experiments/res-festa/`](experiments/res-festa/) | L'aleta libre: una ecuación de ondas en toda la sala; cada mano lanza un anillo de oro; tocar a la vez ordena las figuras hasta que la sala florece. |
| `res-acta` | Ressonància — estudio: Cierre | visual | runtime | **prototype** | Vicente | [`experiments/res-acta/`](experiments/res-acta/) | El acta: el castell del grupo, las cuatro barras de valores, la frase final y los créditos. |
| `res-3d` | Ressonància — base 3D | visual | runtime | **prototype** | Vicente | [`experiments/res-3d/`](experiments/res-3d/) | Three.js r187 en el laboratorio y la sala como CAVE: una cámara *off-axis* por muro desde el centro, manos en el plano del muro, bloom. 60 fps a tamaño completo en WebGPU y WebGL2. |
| `res-3d-study` | Ressonància — estudio 3D | visual | runtime | **prototype** | Vicente | [`experiments/res-3d-study/`](experiments/res-3d-study/) | Muestra una pieza 3D sola (`?part=plaza`, `castell`, `atmos`…) con sus parámetros. |
| `res-intro3d` | Ressonància — Intro 3D | visual | runtime | **prototype** | Vicente | [`experiments/res-intro3d/`](experiments/res-intro3d/) | La plaça en 3D: una plaza de Barcelona de noche alrededor de la sala, la línea de luz, cuatro castells de luz, la plaza rota en espejos, el lema y el título. 42–51 fps en un M1 Max a tamaño completo; falta medir en la sala. |

Las cuatro propuestas son **prototipos independientes** que viven en `docs/proposals/` (no se mueven ni se editan desde el laboratorio). Si se
promueven a *runtime-ready*, nacen en `lab/experiments/<id>/` con su `NOTES.md` y pasan por la lista de comprobación de `lab/CLAUDE.md` §13.

## Plantillas

| Id | Tipo | Qué enseña |
|---|---|---|
| [`_template`](experiments/_template/) (`lab-template`) | visual, runtime-ready | Halo: una luz suave por mano que se disuelve. WebGL2, manos por *stroke*, metros, costura sin corte (`REPEAT` y distancias circulares), parámetros, textura de realimentación. |
| [`_template-sound`](experiments/_template-sound/) (`lab-template-sound`) | sonido, runtime-ready | Campanas suaves: una por toque en su muro (altura en metros → nota), cola larga al soltar, pad y sub. Sólo síntesis. |
| [`_template-prototype`](experiments/_template-prototype/) | prototipo (una página) | Blooms: ratón = toque, Shift+clic fija una mano, tira de sala (F), escala corporal (B), manos virtuales, 4.1 simulado. |

## Cómo se ve cada cosa

- Todo: `node lab/harness/serve.mjs` → <http://localhost:8780/> (índice con las tarjetas y su estado).
- Motor real con el perfil simulado: `node lab/tools/lab-engine.mjs` → <http://localhost:8771/>.
- Comprobación automática y captura: `node lab/tools/check.mjs /experiences/<id>/index.html --delay 8000 --shot <ruta>.png`.

## Peticiones generales al estudio

- Poder cargar experimentos de una carpeta externa en `npm start` (hoy el motor sólo lee `experiences/`; el laboratorio usa un lanzador aparte,
  `lab/tools/lab-engine.mjs`, que no cubre Spout ni la ventana de audio). Sugerencia: una variable de entorno que añada carpetas de experiencias.
- Confirmar la altura de imagen (3,75 m según el director; `profiles/xrlab.json` aún dice 3,5 m): el arnés usa 3,75 m (`?wallH=3.5` prueba la otra).
- Confirmar el mapa de audio real de XR Lab: el laboratorio diseña para 4.1 (un canal por muro + sub); el perfil actual comparte canales (Q-SYS) y no tiene sub.
