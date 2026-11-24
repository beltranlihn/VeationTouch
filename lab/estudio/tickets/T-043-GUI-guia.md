# T-043 — GUI · La guía nueva: manos fantasma, escalera de enseñanza, sin contadores

Dueño: GUI · Plan aprobado por Vicente: `experiments/ressonancia/PLAN-INTERACCION.md` (§1.2, §1.6, paso 5) · 24-11, ~14:50.

## Qué
1. **Un solo sistema de manos fantasma** en `guide3d.js`: manos de luz (la mano de trencadís, sin anillo) sobre el plano del muro que
   hacen el gesto junto a las manos reales. API: `guide.ghost(wall, gesture, strength)` con gestos `tap` (tocar), `gather` (juntarse
   hacia el centro), `rise` (subir 30–60 cm), `lower` (bajar), `still` (quieta, respira), `raise` (alzar una mano, lento). Lo maneja
   la propia guía desde el estado (`state.assist`, `state.learned`); el host o una parte pueden llamarlo también.
2. **Escalera de enseñanza**: al entrar en cada bloque el anillo de vidrio enseña el gesto (mano fantasma en el anillo); en cuanto
   `state.learned[verbo]` está puesto, el anillo **se disuelve** (se rompe por segmentos) y deja la diana al universo. Mientras ENT no
   publica `learned`/`assist` (T-038), un sustituto por reloj: aprendido a los 15 s de juego con manos; ayuda que crece si no.
3. **Sin contadores** («0 de 2 muros», «1 de 3», «piso 8» fuera; los nombres reales de los pisos se quedan como etiqueta);
   invitaciones de ≤ 3 palabras que se van al aprender; cartela 6 → 4 s (la guía la retira a los 4 s; el juego sigue debajo).
4. **L'aleta**: sin texto en el muro; manos fantasma que suben despacio bajo la enxaneta (centro de cada muro).
Todo en español.

## Archivos
`ressonancia/scenes3d/guide3d.js` (y, si hace falta, `typo3d.js`) · `notas/GUI.md` · mi fila del TABLERO. Nada más.

## Pasos
1. Respaldo `guide3d.T043.js.bak`. 2. Verbos y textos por bloque (tabla en notas). 3. Pool de manos fantasma (2 por muro), gestos en
CPU (posición/escala/alfa por frame, sin asignar memoria), material de la mano de trencadís. 4. Sustituto de `learned`/`assist`.
5. Disolución del anillo al aprender. 6. Capturas con estados forzados (pinya, tronc, aleta) y sin errores WebGPU/WebGL2.

## Punto seguro de corte / volver atrás
Cada paso deja la guía funcionando; si algo falla: `cp guide3d.T043.js.bak guide3d.js`.

## Prueba
Estados forzados por `--eval-file`: antes de aprender se ven anillo + mano fantasma con el gesto; tras `learned` el anillo se rompe y
la invitación se va; en `crown` ningún texto y manos subiendo; ningún texto con números en un pase (búsqueda en `lines()` + pase ×4).
