# Integrar Ressonància en la app (noche del 24-11-2026)

Vicente entrega su avance hacia las 8:30 en `lab/vicente`. Objetivo: esa misma noche, en el servidor de la sala, actualizar el
software, cargar la obra y correrla con la calibración que ya tiene la sala.

## Lo que ya está ensayado (con su commit 6491dd9)

- **Rama de integración** `integrate/ressonancia`, salida de `main` (e7a89bd), en `.data/worktrees/integrate`.
- **`scripts/integrate-lab.mjs`** copia `lab/experiments/<id>` → `experiences/<id>` sin lo que sólo sirve en el laboratorio
  (`review.html`, `sala3d.*`, `preview.png`, carpetas `shots`). Si una pieza importa una carpeta hermana que falta en la lista,
  avisa y termina con error.
- **Hay que copiar cuatro carpetas, no dos**, sin reescribir ninguna ruta. En total son 51 MB y ningún archivo pasa de 20 MB.

  | Carpeta | Para qué |
  |---|---|
  | `res-obra3d` | la obra (visual) |
  | `ressonancia` | partitura, escenas 3D, three.js r187 (MIT, con licencia) y texturas |
  | `res-3d-study` | parámetros por defecto de cada parte. **Si falta, falla en silencio** |
  | `ressonancia-sound` | el sonido: 104 mp3, 22 MB |

- **Prueba nueva `tests/experience-deps.test.mjs`:** toda carpeta hermana que se importe por ruta relativa tiene que estar en el
  catálogo. Sabe fallar: quitando `res-3d-study` cae.
- **Resultados del ensayo:**
  - `npm run check`: 91/91.
  - `tests/experience.test.mjs`: 18/18.
  - El **motor real** sirve las cuatro carpetas.
  - La página corre con el **runtime real**, sin errores de consola, a 30 fps en el visor (escala 0,5); las manos virtuales del
    perfil simulado la activan.
- **El arranque tarda ~15 s en negro** mientras compila los shaders: cargarla antes de que entre el público.

## Paso a paso a las 8:30

1. **Traer la entrega:**
   `git fetch origin lab/vicente` y `git -C .data/worktrees/lab-vicente checkout --detach origin/lab/vicente`.
   Leer su `RESSONANCIA.md` y `NOTES.md`: carpetas nuevas o cambiadas, y peticiones al estudio.
2. **Copiar:**
   `node scripts/integrate-lab.mjs --from ../lab-vicente res-obra3d ressonancia res-3d-study ressonancia-sound`.
   Si avisa de una carpeta hermana que falta, añadirla.
3. **Probar en el portátil:**
   - `npm run check`
   - `node --test tests/experience.test.mjs tests/experience-deps.test.mjs`
   - Motor en un puerto libre:
     `node engine/main.js --data <scratch>/engine-data --port 8791`
     (el 8772 lo ocupa otro programa).
   - Abrir `/experiences/res-obra3d/index.html?run=1&view=1` y mirar la consola, los fps y que las manos virtuales actúen.
4. **Commit en `integrate/ressonancia`:**
   `Experiences: Ressonància from lab/vicente <sha> (res-obra3d, ressonancia, res-3d-study, ressonancia-sound)`.
   Después, merge a `main` y push.
5. **Servidor de la sala:** el bloque «Aviso para el agente del servidor» de abajo.
6. **En la sala:** la lista de comprobación de abajo.

## Aviso para el agente del servidor (plantilla)

> Actualiza VEATION Touch a `main` <sha>:
> - Cierra la app.
> - Ejecuta `git pull`. No hay dependencias nuevas, así que no hace falta `npm install`.
> - Ejecuta `npm start`.
>
> La calibración y el perfil de la sala viven en `%APPDATA%\VEATION Touch` y el pull no los toca. Antes del pull, copia esa
> carpeta como respaldo.
>
> Pestaña Experiences:
> - Deben aparecer «Ressonància — the whole work in 3D» (`res-obra3d`) y «Ressonància — sound» (`ressonancia-sound`). También
>   aparecen `ressonancia` y `res-3d-study`: son módulos de apoyo, **no se lanzan**.
> - En Live, crea un preset con visual `res-obra3d` (Quality: High) y sonido `ressonancia-sound` (voz: el idioma que diga
>   Beltrán).
> - Lánzalo y espera ~15 s de compilación.
>
> Comprueba y apunta en NOTAS-SERVIDOR.md:
> - fps de la salida;
> - si `engine.log` dice `Spout GPU path failed` (sería el camino lento por CPU, ~20 fps);
> - que el sonido sale por los 4 muros;
> - que cada toque suena **una sola vez** (ver el riesgo 1);
> - que una mano real aparece a la altura real (ver el riesgo 3);
> - cualquier error de página en `engine.log`.

## En la sala: qué mirar

1. **La obra entera de principio a fin con 2–3 personas, y una vez sola.** El análisis dice que hoy no hay camino en solitario.
   Comprobar si Vicente lo arregló.
2. **Spout:** 60 fps a 7196×912 con WebGPU. Si va lento, bajar Quality a Medium.
3. **Sonido:**
   - que no se dupliquen los impactos;
   - el reparto por muros con el mapa real del Q-SYS (los muros comparten canales y no hay sub);
   - el volumen de las voces.
4. **Altura:** el perfil dice 3,5 m y la imagen mide 3,75 m. Con el Verify de la calibración, una mano a 1,25 m debe caer a
   1,25 m en la imagen. Si no, corregir la altura del muro en el perfil de la sala (en la app del servidor).
5. **El camino de las manos:** los toques muertos del análisis (`docs/research/ressonancia-analisis-obra.md`), ahora con LiDAR real.

## Riesgos conocidos

1. **Impactos de sonido duplicados.** Las partes mandan `fx` por `BroadcastChannel('ressonancia')` desde cada instancia de la página.
   En la app la página corre dos veces (sala + visor), así que cada toque llegaría 2–3 veces al sonido. Arreglo (lo hace Vicente):
   sólo emite la instancia de sala, `if (vt.sink === 'viewer') return;` antes de cada `postMessage` de tipo `fx`.
   Si no llega arreglado, el estudio lo parchea al integrar.
2. **GPU:** dos `WebGPURenderer` con TAA y bloom (sala + visor) más el mezclador de clips. La RTX 6000 Ada debería ir bien; se mide
   en la sala.
3. **Altura de muro** 3,5 frente a 3,75 (arriba).

## Decisiones del director

**Tomadas (24-11, «lo que recomiendes tú»):**
- **Al servidor va `main` + Ressonància**, la versión ya probada en la sala. `media-v2` queda para después.
- **Se aprueban las excepciones de samples y español** para esta obra; están anotadas en `CLAUDE.md`.

Las opciones que se plantearon:

- **Qué software va al servidor:**
  - `main` + Ressonància: la versión que ya se probó en la sala; recomendado.
  - `media-v2`: MP4, conversión a HAP, Live nuevo; no se ha probado en la sala.
- **Excepciones al contrato de experiencias para esta obra:**
  - samples de audio: 104 mp3 de voz y stems (la regla es «sólo síntesis»);
  - texto en pantalla y voz en español (la regla es «sólo inglés»).

  Si se aprueban, se anotan en `CLAUDE.md` como excepción de Ressonància.
