# T-051 — POV · Pom: tres subidas distintas + Acta: la huella

Dueño: POV · Brief: propuesta-interaccion §4.5 (Pom) y §4.10 (acta); estilo ARTE-3 + PARTS.md «What the room gives since T-048» · 24-11.
Depende de T-050 (POS: score.js / sound.js) — nombres de estado/eventos en `notas/ENT.md` › «T-050»; hasta entonces, parámetros sustitutos.

## Qué
1. **pom3d**: tres subidas distintas según `pomStage`:
   - *relay* (dosos): la luz de oro nace bajo la mano que la tiene y VUELA en arco visible (1,5 s) a la siguiente mano quieta, en cualquier
     muro; un HILO de oro fino queda entre todas las manos que la llevaron (constelación del grupo); si titubea, tiembla y vuelve.
   - *breath* (acotxador): sube por el cañón de líneas con la quietud de toda la sala; una racha visible agita nubes/líneas al moverse.
   - *silence* (enxaneta): la imagen se calma casi a quietud (menos motas, líneas tenues), una sola luz fina sube; `hush:break` = onda mínima.
   Se conservan la subida de 90 m, la ciudad de líneas y la enxaneta + rayos de l'aleta. Receta de luz/halo compartidos donde encaje. Sin glitch.
2. **actatext**: la huella — desde ~3 s cada mano apoyada deja una HUELLA de oro que queda (`prints[]` de POS; sustituto: las manos);
   se ordenan en anillo alrededor de «X de Y · descarregat»; los cuatro valores como cuatro diales finos; línea de muro «Dejad vuestra mano»
   (EN «Leave your hand») de borroso a nítido, se va al caer la primera huella.
3. **guide3d**: sólo las cadenas de muro del Pom / acta.

## Archivos (míos)
`scenes3d/parts/pom3d.js` (+ carpeta), `scenes3d/parts/actatext.js` (+ .json), `scenes3d/guide3d.js` (sólo cadenas Pom/acta). Notas: `estudio/notas/POV.md`.

## Respaldo / volver atrás
`cp parts/pom3d.T051.js.bak parts/pom3d.js` · `cp parts/actatext.T051.js.bak parts/actatext.js` · `cp guide3d.T051.js.bak guide3d.js`.

## Prueba
`/experiences/res-obra3d/index.html?sound=ressonancia-sound&demo=0` con 0, 1 y 4 manos (P → Go to pom / acta) y `res-3d-study/index.html?part=pom3d|actatext`;
`node lab/tools/check.mjs "<url>" --shot … --delay …` silencioso, WebGPU + WebGL2, 0 errores de consola. Zonas tranquilas respetadas. Sin commits.
Hito: hoja de contactos (relevo 1 y 4 manos, aliento, silencio, acta con huellas) en `notas/POV.md`.
