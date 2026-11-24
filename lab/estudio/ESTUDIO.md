# Estudio Ressonància — cómo trabajamos

Vicente habla sólo con el **director** (la sesión principal de Claude). El director reparte, desbloquea, presiona, verifica e
informa; no construye. Protocolo completo: la skill `director-de-estudio` (`INTERACTIVE EXPERIENCES/.claude/skills/`).
Contrato: `lab/CLAUDE.md` (licencias; sin red; sala a escala humana). **Desde el 23-11, Beltrán permite modificar todo el repositorio**: lo de fuera de `lab/` se toca sólo cuando haga falta, y con `npm test` y `npm run check` en verde.

## Equipo (≤ 7 agentes)
| Sigla | Rol | Ahora |
|---|---|---|
| 3D-BR | Capítulo I · Brasa en 3D | T-001 |
| 3D-PI | Capítulo II · Pinya en 3D | T-002 |
| 3D-PO | Capítulo IV · Pom de dalt en 3D | T-003 |
| 3D-FE | Capítulo V · coronación y ressonància en 3D | T-004 |
| INT | Interactividad e integración: la obra 3D entera (director/score, transiciones, guía, Tronc, bajada, acta) | T-005 |
| QA | Verificación: capturas contra referencia, fps con control positivo, prueba de humo del pase | T-006 |
| — | SND y NAR: hoy sin agente (el sonido y el guion están entregados); se abren si hay pedido | — |

## Reglas
1. **Nadie aprueba su propia pieza**: QA da PASA / FALLA con evidencia (captura comparada + números).
2. **Recursos compartidos por turno** (ver `TURNO.md`): hoy el único es **GPU-MEDICIÓN** (medir fps). Las comprobaciones
   funcionales y capturas (`lab/tools/check.mjs`) son libres; **medir fps sólo con turno**, porque seis agentes a la vez falsean
   la medida. **Mientras alguien tiene GPU-MEDICIÓN, nadie más abre ventanas de comprobación** (`check.mjs`): se trabaja en código. Un turno se concede con la línea en `TURNO.md` **y** un mensaje directo del director.
3. **Silencio**: las comprobaciones no suenan (`LAB_AUDIBLE` nunca); nadie reproduce audio en el Mac de Vicente.
4. **Un solo escritor por archivo**: cada agente escribe sólo los archivos de su ticket y su `notas/<SIGLA>.md`.
5. Respuestas al director: ≤ 3 líneas (qué hice, evidencia, qué falta). Al terminar, el informe largo en `notas/<SIGLA>.md`.
6. Borrar se pregunta a Vicente; por defecto se oculta o desactiva. Respaldo antes de reemplazar.
7. Lo que Vicente corrige es regla para siempre: va a `DECISIONES.md`.
8. **Si la sesión del director se cierra, los agentes se paran.** Al volver: comprobar qué dejaron en disco, reanudarlos con mensaje (no relanzarlos de cero) y replanificar plazos.
9. **Sólo QA mide fps** (un único instrumento, con control positivo; `notas/QA.md` §1–3). Los constructores no miden: piden la medición al director.
