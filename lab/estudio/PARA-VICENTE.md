# Para Vicente — mañana del 24-11

> La obra entera en 3D corre de la espera al acta sin errores, con un universo por capítulo y transiciones por fragmentación.
> Todo con PASA de QA (prueba de humo final 04:50 + repeticiones a ritmo normal 04:58). Equipo congelado desde las 05:00.
> **Nada commiteado** (falta que decidas la autoría, DUDA 2). Hubo una parada por límite de uso de 00:18 a 03:11.

## Qué abrir
Si no responde: en la carpeta del repo, `node lab/harness/serve.mjs`.

- **La obra entera en 3D, con público virtual y sonido**
  http://localhost:8780/experiences/res-obra3d/review.html
  Tarjeta de inicio: capítulo de inicio, voz English / Español, 2 / 6 / 15 personas, calidad media (portátil) / alta (la sala).
  Un clic para empezar. Volumen: el fader arriba a la derecha o las teclas − / +.
- **Álbum**: una captura por capítulo en `lab/estudio/album/01-wait.png … 12-acta.png`.
- **Cada capítulo suelto** (con su panel de parámetros, tecla P):
  http://localhost:8780/experiences/res-3d-study/index.html?part=brasa3d — también `pinya3d`, `tronc3d`, `pom3d`, `festa3d`,
  `baixada3d`, `fall3d`, `actatext`.
- **La intro 3D sola** (la plaza que se fragmenta, sin tocar desde ayer): http://localhost:8780/experiences/res-intro3d/index.html

## Qué mirar (en orden de la obra)
1. **Espera** — casi negro; una línea de brasas que respira a la altura de las manos y chispea al tocarla.
2. **I · Brasa** — tocar levanta un chorro de chispas de correfoc; arrastrar deja un rastro de brasas; diablos que corren.
3. **II · Pinya** — una multitud de materia oscura; la luz nace en la palma de quien aprieta; cuerpos que arden por turnos.
4. **III · Tronc** — la plaza de noche; el castell sube piso a piso con **trencadís** vidriado (piedra → terracota → rojo), se inclina si falta un lado. Crece más allá del muro a propósito: en Pom la sala sube a verlo.
5. **IV · Pom de dalt** — 32 m de altura sobre Barcelona (azoteas, cúpula, Eixample, bruma), torres de cuerpos de brasa. **DUDA 4.**
6. **V · Coronación + ressonància** — destello de oro por lo alto, coronas, la sala se llena de luz; luego la parte libre: roseta con una mano, grieta de luz que da la vuelta a la sala con el grupo, y un único florecimiento.
7. **Bajada «Luz que llueve»** — el castell se deshace en esquirlas de colores que caen; la mano las recoge.
8. **Caída** — *carregat* (se hunde desde la base) o *intent* (la ciudad se rompe y el castell del grupo estalla).
9. **Acta** — negro y tipografía, montada con partículas de oro.
10. **Cada cruce entre capítulos** — ¿se lee como fragmentación?

## Rendimiento (M1 Max, medido por QA)
Media: ≥ 60 fps en todos los bloques. Alta: Tronc 49, bajada 46, el resto 65–286. Tirones al cambiar de capítulo ≤ 30 ms.
La sala (RTX 6000 Ada) es mucho más rápida: en la sala, calidad alta.

## Lo que queda o conviene que mires tú
- **Coronación**: muy llena de líneas de oro (sólo ~20 % de la vista oscura). Es a propósito (el momento más luminoso), pero júzgalo.
- **Festa con 15 manos recién puestas**: la métrica de parpadeo sube a 6–10 %; no distingue parpadeo de anillos nuevos. Míralo en movimiento.
- **Pinya**: los cuerpos aún tienen algo de maniquí de cerca; de lejos funcionan.
- **Transición Tronc → Pom**: un breve cielo intermedio con constelaciones (menor).
- **LiDAR simulado**: con 9 manos quietas, el sensor genera muchos trazos nuevos; el host ya fusiona los duplicados. El LiDAR real lo dirá.
- **Sonido**: nadie lo ha escuchado con la obra 3D (las pruebas son mudas por tu petición). Escúchalo tú con el volumen a tu gusto.

## Sólo se ve en la sala
Escala real de cuerpos, torres y texto; la luz en las proyecciones; el sonido 4.1; el LiDAR real; el rendimiento en la RTX 6000 Ada.

## Dudas abiertas (`DUDAS-USUARIO.md`)
2 · ¿Con qué nombre firmo los commits? (no se commitea hasta que respondas)
3 · ¿El texto de los muros también en español? (por defecto: sólo inglés)
4 · Pom de dalt: ¿torres surrealistas a la altura del ojo (lo que hay) o castells reales lejos en la ciudad?

## Dónde está todo
`lab/estudio/TABLERO.md` (estado por ticket) · `TURNO.md` (medidas y turnos) · `DECISIONES.md` · `notas/<rol>.md` (detalle y capturas de cada uno).
