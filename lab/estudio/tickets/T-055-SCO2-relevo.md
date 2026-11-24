# T-055 — SCO2 · Intro: faroles con la mano · Brasa: altura → tono + el relevo (partitura, sonido, público virtual)

Dueño: SCO2 · Brief: propuesta-interaccion §4.1 (intro) y §4.2 (Brasa) · 24-11. Gemelo visual: T-056 (VIS2: plaza.js, brasa3d.js).
Contrato de nombres: `notas/ENT.md` › «T-055» (escrito ANTES del código).

## Qué
1. **Intro, faroles**: cada mano que aterriza emite `lamp:<muro>` (`S.lamp`, `S.lamps[]`); la parte visual enciende el farol más cercano.
   Sin manos, los faroles se encienden solos como hoy. Sonido: una campana suave en ese muro, en la tonalidad de la intro.
2. **Brasa, altura → tono**: el chorro/golpe de cada mano suena más grave cuanto más baja (los niños hacen los graves). Sólo sonido.
3. **Brasa, el relevo** (entre la chispa, ahora 12 s, y la llamada): un diable corre por el muro a paso de persona hacia la mano de
   delante a ≤ 2,5 m y salta a ella; sin manos delante casi se para; a los 6 s otros diables lo buscan; meta: una vuelta entera; cada
   esquina, una llamarada. Después, la llamada como hoy. Sonido: fuego que corre, llamarada por esquina, soplo por salto.
   Parámetros `t.brasa.relay*` en tuning.js + manifest (con «sala»).
4. **Público virtual**: manos que encienden faroles en la intro; una cadena de manos que se adelantan en el relevo.

## Archivos (míos)
`ressonancia/score.js` = `ressonancia-sound/score.js` (idénticos, `cmp`), `ressonancia-sound/sound.js`, `tuning.js` ×2 (idénticos),
`res-obra3d/manifest.json` (parámetros t.…), `res-obra/autopilot.js`, `ressonancia/GUION.md`.

## Respaldo / volver atrás
`*.T055.bak` junto a cada archivo: copiarlos encima.

## Prueba
Node contra score.js solo: relevo con 0 / 1 / 4 manos (tiempo de vuelta, ayuda), la intro emite faroles sólo con manos, la llamada sin
cambios; suites anteriores (`pos/t050.mjs`, `ent/t038/items.mjs`). Duración del pase 9:15–9:45. Sin commits.
