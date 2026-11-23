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
