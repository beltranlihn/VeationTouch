# Decisiones

| Fecha | Quién | Qué | Por qué | Cómo se vuelve atrás |
|---|---|---|---|---|
| 23-11 | Vicente | La obra dura ~10 min, es narrativa y guiada (voz, texto, botones), 2–15 personas | público libre en bloques de 30 min | — |
| 23-11 | Vicente | Cuatro valores = cuatro capítulos, cada uno con su universo; L'aleta tiene parte libre interactiva | GUION.md aprobado | GUION.md |
| 23-11 | Vicente | Todo se genera en la obra (sin vídeo aparte); intro por código | — | — |
| 23-11 | Vicente | Pasar a 3D con Three.js; referencia: Random Eyes, Lucerra Aura, imágenes de materia + glitch | ARTE.md | volver a los universos 2D (`res-obra`) |
| 23-11 | Vicente | **La fragmentación es el lenguaje de la obra** (le encantó la plaza rompiéndose): transición entre capítulos | — | — |
| 23-11 | Vicente | Corre en el servidor de la sala (RTX 6000 Ada): calidad alta por defecto; media/baja para el portátil | — | parámetro `quality` |
| 23-11 | Vicente | Sonido contemporáneo e inmersivo con ElevenLabs; voz EN Lily, voz ES Mía Evans (España, vosotros) | — | parámetro `lang` |
| 23-11 | Vicente | Volumen regulable por él; las comprobaciones nunca suenan en su Mac | le sonaba al máximo | `lab.volume`, `LAB_AUDIBLE` |
| 23-11 | Vicente | Trabajar en modo director con equipo de agentes (skill `director-de-estudio`) | — | — |
| 23-11 | director | `estudio/` vive en `lab/estudio/` | se creó cuando el contrato sólo permitía `lab/`; se queda ahí para no romper las rutas de los agentes | mover a la raíz en un momento tranquilo |
| 23-11 | Vicente | Agentes del estudio con **Opus 5.5, esfuerzo medio** | respuesta a la duda 1 | pedir Fable en un brief |
| 23-11 19:52 | Beltrán (vía Vicente) | **Permiso para modificar todo el repositorio**, no sólo `lab/`; se trabaja en el mismo repo y se integra todo en conjunto después | — | — |
| 23-11 19:52 | director | Con ese permiso: la skill también en `.claude/skills/director-de-estudio/` del repo; cambios fuera de `lab/` sólo cuando hagan falta, con `npm test` y `npm run check` en verde antes de commitear | no romper la app de Beltrán | revertir el commit |
| 23-11 22:44 | director | pom3d copia lo mínimo del generador de cuerpos de castell.js (con atribución) en lugar de pedir una exportación | un solo escritor por archivo: castell.js es de INT | exportar el generador desde castell.js más adelante |
| 23-11 22:52 | director | En Tronc y la bajada el castell va cerca (≈ 6,5 m) y sin «fit»: crece más allá del borde superior de los muros; en Pom de dalt la sala sube a ver la cima | el castell es el protagonista y la subida tiene sentido narrativo | `fit` y `distance` del castell |
| 23-11 23:09 | director | `castell.js` pasa de INT a 3D-FE mientras dura T-011 (rendimiento) | INT está con la prueba de robustez; un solo escritor por archivo | devolverlo a INT al cerrar T-011 |
| 23-11 23:20 | director | Pom de dalt mantiene las torres surrealistas de T-003 (opción a); el paso 1 de T-008 (torres a escala de castell) se descarta | con el ojo a 32 m una cima de 12 m queda a −64°, fuera de la ventana de los muros (−25°); bajar el ojo esconde la ciudad, el mar y los tejados que QA elogió | `scratchpad/pom3d/pom3d.step1-castell-height.js`; DUDA 4 |
| 23-11 23:26 | director | T-011: primero el paso 5 del ticket (recortar más la parte trasera); si sigue < 45 fps-eq en el M1 Max, MSAA 2 en calidad alta, siempre que las capturas sean iguales a ojo | la sala tiene una RTX 6000 Ada, mucho más rápida que el M1 Max: el 45 es un indicador, no el listón de la sala; MSAA 4 → 2 casi no se ve a esta resolución | volver a `samples: 4` |
| 23-11 23:50 | director | `actatext.js` pasa de INT a 3D-PI (llegada del acta por fragmentos, T-022) | INT está cargado (bajada, caída, guía, transiciones); un solo escritor por archivo | devolverlo a INT |
| 23-11 23:52 | director | La caída tras Pom (*intent*): la ciudad de pom se rompe y en el negro aparece, montándose por fragmentos (~1,5 s), el castell que el grupo levantó en el Tronc (pisos del estado, no el último build de castell.js); luego el guion de caída | en Pom no hay castell en pantalla; lo que cae es lo que el grupo construyó | volver a usar el castell.js oculto |
| 23-11 23:56 | director | `castell.js` vuelve de 3D-FE a INT (T-011 PASA) | se cumplió lo previsto a las 23:09 | — |
| 24-11 00:00 | director | El florecimiento de la ressonància (evento `bloom`, máximo de grupo) LLENA la sala de luz a propósito (GUION: «la sala entera florece una vez», «el momento más luminoso de la obra»); criterio nuevo en vez del ≤ 35 %: subida de la luma media ≤ ×2 por segundo (sin destello), sin quemar (≤ 2 % de píxeles a 255), una sola vez por pase, vuelve a la calma en ≤ 8 s | la FALLA de QA de T-014b medía el lavado de T-018, que pedí yo | volver al tope del 35 % |
