# T-017 · 3D-BR · La caída (part nuevo `fall3d`)

- **Dueño:** 3D-BR · **Verifica:** QA · **Integra:** INT (en `res-obra3d`, bloque `fall`)
- **Archivos (único escritor):** `lab/experiments/ressonancia/scenes3d/parts/fall3d.js`, `lab/experiments/res-3d-study/parts/fall3d.json`,
  `notas/3D-BR.md`. No se tocan `castell.js`, `plaza.js` ni `res-obra3d`.
- **Guion:** GUION.md (Pom de dalt «si falla» → *intent*; La bajada «si todos sueltan» → *carregat*): una secuencia prediseñada de 15 s y
  después el acta. Digna, no «game over».

## Qué es
Una torre de fragmentos por cada muro del castell (los de `state.walls`; todos si no hay): figuras sugeridas hechas de esquirlas cálidas
(pinya de tres anillos, tronc de `floors` pisos de tres, pom de dalt), donde estaba el castell. Guion en su reloj (`state.t` del bloque
`fall`; en el estudio, `input.t`):
- **0–2 s quietud:** todo quieto, la luz se sostiene; un temblor apenas visible crece.
- **2–3,5 s la primera grieta:** una línea fina de luz corre por la torre desde el punto que cede (*intent*: arriba, el pom; *carregat*:
  abajo, la pinya que suelta), un destello leve en ese punto.
- **3–9 s el derrumbe** en el lenguaje de la obra: las esquirlas se sueltan (intent: de arriba abajo, la parte alta vencida hacia un lado;
  carregat: de abajo arriba, la torre se hunde en vertical), caen con gravedad girando, destellan como espejo, tocan el suelo, rebotan
  poco y se apagan (brasa → oscuro).
- **9–13 s reposo:** los fragmentos en el suelo se apagan uno a uno; un polvo lento sube y se aclara.
- **13–15 s silencio y oscuridad:** negro total a los 15 s, listo para el acta.
- `arrive`: aparecen en su sitio (fundido rápido) mientras el castell de `castell.js` se va; `leave`: fundido a negro.

## Contrato
`input.state.outcome` ('intent' | 'carregat'), `.block`, `.t`, `.walls`, `.floors`/`acta.floors`; eventos `fall` (reinicia el reloj si
no hay `state.t`). Estudio: params `outcome`, `t` del host (con `run` apagado se congela un instante), `floors`, `towers`, `arrive`,
`leave`, `duration`.
**Aviso a INT / director:** `score.js` tiene `TIMES.fall = 12`; la secuencia dura 15. El part acepta `duration` (escala su guion);
INT decide (12 con la secuencia comprimida, o subir `TIMES.fall` a 15).

## Pruebas (PASA)
Tableros a t = 0, 2, 5, 9, 13, 15 s para *intent* y *carregat* (tira 7196×912, `run=false`); costura P3|P4 continua (recortes a cada
lado); sin errores en WebGPU y WebGL2. Puntos de corte: el polvo es lo último (se puede quitar sin tocar lo demás).
