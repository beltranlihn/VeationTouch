# T-032 · 3D-FE · III. Tronc — la torre-ensamblaje (ARTE-2 §3: terracota, esmalte, cromo)

- **Dueño:** 3D-FE · **Revisa:** QA · **Integra:** INT (lista de partes del bloque tronc en `res-obra3d/experience.js`)
- **Archivos (sólo estos):** `ressonancia/scenes3d/parts/tronc3d.js` (reescrito; respaldo `tronc3d.ARTE2.js.bak` al lado),
  `res-3d-study/parts/tronc3d.json` (respaldo `tronc3d.json.ARTE2.bak`), `notas/3D-FE.md`, mi fila de `TABLERO.md`.
  Sin assets externos (geometría generada; si hace falta, carpeta `parts/tronc3d/` con SOURCES.md).

## Qué es
Detrás de cada muro del castell (estructura `state.walls`), a ~6,5 m, una **torre de fragmentos de la ciudad** flotando en el vacío.
Una base de piedra y **9 pisos = los 9 pisos de la partitura** (Segons…; los nombres los dibuja GUI). Cada piso es un fragmento distinto:
1 tambor de ladrillo de terracota · 2 anillo de trencadís esmaltado · 3 balcón de hierro forjado · 4 esfera de cromo con satélites ·
5 macetas de terracota con flores · 6 caja de vidrio con un núcleo de luz · 7 corro de cuerpos de luz · 8 chimenea retorcida de
trencadís (Gaudí) · 9 aguja de cromo y oro (la enxaneta). Cada piso gira lento sobre su eje y flota con un hueco sobre el de abajo.
- **Pulso / piso:** el piso que se forma (`floorProgress`) flota disperso alrededor de su hueco y se acerca con el progreso; con el evento
  `floor` vuela a su sitio y **encaja con peso** (la torre se hunde unos cm y rebota) y un destello.
- **Inclinación física:** el ángulo de la torre es un muelle amortiguado que persigue `lean[w]·7°` (sobrepasa y oscila); `weak[w]` añade
  temblor (más arriba, más). Con la torre inclinada, las **piezas sueltas** (tejas, macetas, esquirlas, satélites) se sueltan, **resbalan
  por las cubiertas en la gravedad inclinada, caen, rebotan en los pisos de abajo, giran** y se pierden en el vacío; al enderezarse la
  torre ~2 s, vuelven volando a su sitio.
- **Tocar:** una mano que aterriza en el muro golpea el piso de la torre que está detrás a esa altura (rayo ojo→mano): el piso se
  bambolea, destella y suelta 1–3 piezas que caen y suenan; las teselas cercanas (0–1 m tras el muro) junto a la mano salen despedidas,
  girando, con gravedad. Respuesta el mismo frame. Para el sonido (ola 2): `part.impacts` / `window.__tronc3d.impacts` = cola de
  `{ wall, u, force }` (propuesta de evento `'fx:impact'`).
- **Tres profundidades:** teselas a 0–1 m tras el muro (cerámica, cromo, terracota; fuera de la banda 0,9–1,6 m del centro) · las torres
  a ~6,5 m · fondo lejano (25–70 m): escombros flotantes de la ciudad (losas de fachada, balcones, tejas, farolas) y polvo terracota.
- **Movimiento de sala:** el grupo de la parte baja (= la sala sube como en un ascensor junto a la torre) siguiendo el piso en formación,
  suave (≤ 0,35 m/s, aceleración suave); en el premio la subida continúa, enlazando con la subida del Pom (3D-PO).
- **Materia:** sombreado propio en TSL con entorno procedural (cromo con reflejo, esmalte con brillo especular y fresnel, terracota
  mate, hierro oscuro con brillos, vidrio con fresnel y transparencia, emisivos sólo donde toca para el bloom). Sin luces de escena.
- **arrive / leave:** fragmentación: las piezas llegan girando desde posiciones dispersas y encajan; al irse se separan, suben y se apagan.
- **Premio:** el brillo se apaga de arriba abajo y la subida sigue (se abre la noche del Pom).

## Decisiones para el director / INT
- Propongo que en el bloque tronc el host muestre **sólo `tronc3d` + `atmos`** (sin `plaza` ni los cuerpos de `castell.js`): la torre
  ya incluye su piso de cuerpos de luz, y la plaza es justo lo que ARTE-2 quiere quitar en Tronc. Mientras INT no cambie la lista,
  tronc3d funciona igual encima (ignora la matriz del castell).
- `fall3d`: hoy no se usa tras el tronc. Si en el futuro la caída «carregat» de la bajada debe ser esta torre, tronc3d puede exponer
  `part.collapse()` (todas las piezas sueltas a la vez); hasta entonces fall3d sigue dibujando el castell de partículas.

## Pasos y corte seguro
1. Respaldo (hecho). 2. Esqueleto: piezas instanciadas por geometría, física en CPU, sombreado TSL. 3. Pisos y encaje. 4. Inclinación y
caída. 5. Tocar. 6. Capas cercana/lejana y subida. 7. arrive/leave/premio. 8. Estudio + capturas (15:30). 9. Obra (`review.html&from=tronc`), QA (18:00).
**Corte seguro:** tras cada paso la parte funciona sola. **Volver atrás:** `cp tronc3d.ARTE2.js.bak tronc3d.js` (y el .json).

## Prueba
`res-3d-study/index.html?part=tronc3d` con floors 2/5/9, lean ±1, weak 3, arrive/leave 0,5, WebGPU y WebGL2: `errors: []`, capturas en
`notas/3D-FE.md`. En la obra: `res-obra3d/review.html&from=tronc` sin errores. fps: sólo QA.
