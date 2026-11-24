# T-050 — POS · Pom: tres subidas distintas + Acta: la huella (partitura, sonido, público virtual)

Dueño: POS · Brief: propuesta-interaccion §4.5 (Pom) y §4.10 (acta) · 24-11. Gemelo visual: T-051 (POV, pom3d / actatext).
Contrato de nombres: `notas/ENT.md` › «T-050» (escrito ANTES del código).

## Qué
1. **Pom, tres subidas distintas** (`pomStage`): *relay* (dosos, la luz va de mano quieta en mano quieta, `handoff`, titubea y vuelve,
   deja `pomThread[]`) · *breath* (acotxador, sube con la quietud de TODA la sala, más manos quietas = más deprisa, `gust` sin caída) ·
   *silence* (enxaneta, casi nada, quietud de todos, `hush:break`; llega → 1,5 s de silencio → l'aleta). Se conservan: quietud robusta
   (desplazamiento en 1 s sobre el perímetro), avisos, plazo del Pom (sala vacía 20 s) y «en `max` corona estrecho».
2. **Acta, la huella** (40 s): de 3 a 15 s cada mano que reposa deja una huella de oro que queda (`prints[]`, máx. 60); `acta().prints`.
   Valores como §4.10 (Valor = quietud del Pom + manos en l'aleta; Seny = suavidad de la bajada).
3. **Sonido**: campana de vidrio en el muro que recibe · aire que sube con la quietud, racha · casi nada + tono sostenido, «ah» de la
   plaza · un toque cálido y grave por huella. Niveles dentro de los límites; sólo comprobaciones silenciosas.
4. **Público virtual** (`res-obra/autopilot.js`): manos quietas en el relevo, todos quietos en aliento/silencio, manos que reposan en el acta.

## Archivos (míos)
`ressonancia/score.js` = `ressonancia-sound/score.js` (idénticos, `cmp`), `ressonancia-sound/sound.js`, `res-obra/autopilot.js`,
`ressonancia/GUION.md` (IV Pom y Cierre).

## Respaldo / volver atrás
`*.T050.bak` junto a cada archivo (`score.T050.bak` ×2, `sound.T050.bak`, `autopilot.T050.bak`, `GUION.T050.md.bak`): copiarlos encima.

## Prueba
Node contra score.js solo: 0 / 1 / 4 manos por subida; manos que se mueven → el relevo titubea y el aliento va más lento; nadie → avisos
y caída en el plazo como hoy; huellas con 0 / 1 / 4 manos. Pase virtual completo 9:15–9:40. Sin commits.
