# Ressonància — plan de interacción (respuesta a la propuesta de dramaturgia)

24-11-2026 · director (Claude) para Vicente · sobre `~/Downloads/ressonancia-propuesta-interaccion.md`
Estado: **propuesta, sin código tocado**. Se construye bloque a bloque cuando Vicente apruebe.

## 1. Dónde estoy de acuerdo, dónde no y por qué

### De acuerdo (y lo confirma el código)
- **El diagnóstico es correcto.** `score.step()` sólo recibe `{ stroke, wall, dx, speed }` (score.js l. 91; el host lo arma en
  experience.js l. 135 y el sonido en sound.js l. 946): la partitura no sabe la altura de la mano. Pinya, Tronc, Pom y bajada piden lo
  mismo (una mano en el anillo, a 1,25 m) y el progreso va por reloj. Es la causa de fondo de la monotonía.
- **«Press on the beat» no encaja con el LiDAR (H6).** Lo vivimos anoche: al ensanchar la costura de trazos, 0 aterrizajes en Tronc.
  Subir la mano deslizándola por el muro es lo que mejor ve un escáner paralelo al muro: el trazo no se rompe.
- **La quietud del Pom mide ruido (H7).** 3 cm de temblor a 10 Hz ya son 0,3 m/s. Hay que medir desplazamiento en 1 s, no velocidad.
- **L'aleta interactiva** es el mayor impacto por esfuerzo: el clímax hoy llega sin que nadie haga nada.
- **El cuerpo recorre el castell** (abajo y juntos → subir → quietos → una mano en alto → libres → bajar → huella): la dramaturgia
  física y la narrativa son la misma curva. Es la mejor idea de la propuesta.
- **Florecimiento garantizado** en la ressonància, con tamaño según lo juntos que fueron. Coincide con lo que decidimos para el bloom.
- **Sin contadores** («2 de 2 muros», «0 de 3», «piso 8») y **voz que invita, no ordena**, ≤ 7 palabras, relato dentro de la acción.
- **Caída con aviso** y riesgo salvable (temblor del Tronc).
- **Agregados por muro y umbrales relativos** (subir 30 cm desde donde esté la mano): es lo correcto para niños, sillas y oclusión.

### En desacuerdo o con matices
1. **La espera.** La propuesta parte del estado de esta mañana. Hoy la espera ya es otra cosa, pedida expresamente por Vicente: la
   entrada `umbral3d` (serpentina de trencadís, piezas que caen al tocar, el botón de inicio que se revela jugando, las cuatro
   puertas). **Se queda la nuestra.** Tomo de la propuesta sólo una idea compatible: que la respuesta empiece al *acercar* la mano.
2. **Los anillos sólo en la espera.** Vicente pidió hoy «botones e instrucciones 3D, más elegantes»: el anillo de vidrio con la mano de
   trencadís ya es el icono de la obra. **Compromiso:** el anillo enseña el gesto al entrar en cada bloque y **se disuelve en la diana
   del universo** en cuanto el grupo lo ha aprendido (la palma en Pinya, la banda en Tronc, el halo en Pom). No hay anillo fijo
   seis minutos, pero tampoco desaparece la guía que Vicente pidió.
3. **Idioma.** La propuesta escribe todo en inglés. Desde hoy el muro va **en español** (palabras castelleras en catalán) y la voz en
   español por defecto, con el inglés en el selector. Cada línea nueva se graba en los dos idiomas (ElevenLabs, con permiso de Vicente).
4. **`CARREGAT` en la coronación.** Es técnicamente correcto (carregat = coronado, aún sin bajar), pero nuestro acta usa *carregat*
   como final («coronado pero cayó al bajar»). Mostrarlo en la coronación confundiría. En la coronación: «Coronado · 3 de 7».
5. **El relevo de la Brasa** (el diable que corre de mano en mano por los 27,6 m) es bonito pero caro y depende de que haya manos
   cada ≤ 2,5 m. Con 2–3 personas (el caso más frecuente) la mayor parte del recorrido lo haría la ayuda. Lo dejo **al final** y me
   quedo antes con la **llamada *tok-tok-TOK*** de la Brasa, que es barata y siembra el unísono final.
6. **Manos fantasma en cada parte.** Mejor **un solo sistema** en `guide3d.js` (manos de luz sobre el plano del muro) que cada parte
   reinventándolo: menos código, mismo estilo en toda la obra.
7. **Tiempo.** Lo entregamos el jueves 26 y hoy es martes por la tarde: no cabe todo con calidad. Propongo cortar por bloques y que
   cada paso deje la obra entera recorrible (como pide la propia propuesta).

## 2. Plan por orden de impacto

Cada paso: el cambio en `score.js` (las **dos copias idénticas**: `ressonancia/` y `ressonancia-sound/`), la parte visual, el sonido,
la guía, **una prueba con el público virtual que sepa fallar**, y `GUION.md` + `NOTES.md` al día. Todos los umbrales como parámetros
(`TIMES`) hasta la sesión en la sala. Agentes en Opus; QA y director de arte revisan.

| # | Paso | Qué cambia | Prueba que sabe fallar | Estimación |
|---|---|---|---|---|
| 0 | **Entradas nuevas** | la partitura recibe `y` (m), `vx`, `vy` (m/s), `size` (m) y `s` (m en el perímetro) desde el host **y desde sound.js** (el sonido lleva la partitura); agregados por muro `yMed`, `yL`, `yR`, `span`, `rise` y por trazo línea base `y0` y desplazamiento en 1 s; estado `learned{}` y `assist`; el público virtual aprende a subir, bajar, juntarse y alzar (`stage.put/lift`) | la obra pasa igual que hoy (mismos tiempos con el público de hoy); `y` medida ±2 cm en el arnés | 3–4 h |
| 1 | **L'aleta interactiva** | ventana de 8 s tras el Pom: cada mano que sube ≥ 0,28 m (o > 1,6 m) cuenta; corona con la mayoría o al acabar la ventana (siempre corona); rayos de oro desde las manos alzadas; voz «Ella levanta la mano.» … «Levantad la vuestra.» | con manos quietas corona a los 8 s y más estrecho; con manos que suben, antes y más ancho | 3–4 h |
| 2 | **Tronc = levantar y nivelar** | ciclo de frase de 4,8 s `reunir → subir → encajar`; la banda de hombros sigue la mediana de altura; cuenta el ascenso relativo; quien no sube es base (menos temblor); `lean` desde `yR − yL`; muros sin torre ayudan al 50 %; el pulso queda como reloj musical; **temblor** en el penúltimo piso (5 s para llevar manos al pie o pierde un piso) | con manos quietas el Tronc sube mucho más despacio que con manos que suben; con un lado más alto, la torre se inclina | 6–8 h (tronc3d + guía + sonido) |
| 3 | **Bajada = bajar** | espejo del Tronc: la banda arriba, el grupo la baja; los pisos bajan cuando las manos bajan (reloj sólo como red a `max`); suave ≤ 0,4 m/s limpio, brusco cruje; tres soltados seguidos = carregat | con manos quietas la bajada no baja hasta la red; soltar todo → carregat | 3–4 h (comparte banda con el Tronc) |
| 4 | **Pinya = juntarse** | palma con palma (la figura ya existe) → las figuras se deslizan al centro del muro y la palma las sigue (≤ 0,3 m/s) → se mide `span` en la ventana de 2 m más densa; `fill` depende de lo apretado, no del tiempo; `min` 75 → 50 s | con manos separadas no se cierra el círculo; juntas, sí | 4–5 h |
| 5 | **Guía y voces** | sin contadores; invitación ≤ 3 palabras que se retira al aprender; escalera mostrar → responder → invitar → mano fantasma → aviso → la colla ayuda; manos fantasma en `guide3d`; cartela 6 → 4 s y el juego vivo bajo la cartela; voces nuevas ES/EN (unas 20 líneas, ElevenLabs con permiso de Vicente) | ningún texto con números en un pase completo; la voz nunca repite una frase en un pase | 4–5 h + grabación |
| 6 | **Brasa con relevo y la llamada** | primero la llamada *tok-tok-TOK* con anillos que se contraen en los cuatro muros (ventana −0,5/+0,7 s; tres llamadas: un muro, dos opuestos, los cuatro); después, si hay tiempo, el relevo del diable | sin golpear en la ventana no hay ola grande; con golpes a destiempo tampoco | llamada 3 h · relevo 4–5 h |
| 7 | **La llamada final** | la misma llamada cierra la ressonància: eco entre muros opuestos (frente visible ~3 s, rebote doblado si alguien toca al llegar) y tres o cuatro golpes comunes con el florecimiento **siempre** al final, de tamaño según `resonance` | florece siempre; con unísono, más grande que sin él | 4–5 h |
| — | Pom (quietud robusta) | desplazamiento < 0,15 m en 1 s en vez de velocidad; las tres subidas distintas si hay tiempo | ruido del sensor (3 cm a 10 Hz) no da «inquieto» | 1 h (la quietud) · 4 h (las tres subidas) |

**Calendario propuesto.** Martes tarde-noche: 0, 1, la quietud del Pom, y empezar 2. Miércoles: 2, 3, 4 y 5. Jueves por la mañana:
6 y 7 si llegan; si no, quedan con la regla actual (que funciona). Cada paso deja la obra entera recorrible.

## 3. Qué hay que validar en la sala y qué necesita al estudio

### En la sala (con el S2E real, antes de dar por buenos los umbrales)
1. **Altura a 10 Hz:** ¿`y` estable a ±10 cm con manos que suben a 0,3–0,45 m/s? Fija `rise`, `still` y `gentle`.
2. **Sombras con el sensor arriba:** fila de manos hombro con hombro (Pinya), manos subiendo en fila (Tronc), treinta manos alzadas
   (l'aleta), un adulto junto a un niño. Si se pierden manos, bajar los quórums.
3. **P3 (plano a ~12 cm):** entra más antebrazo, `size` mayor y más sombra: normalizar `span` por muro con datos.
4. **Quietud real:** cuánto tiembla una mano «quieta» en el S2E (para el umbral del Pom).
5. **Ventanas de la llamada y el eco:** con la latencia real (150 ms en la pieza visual, inmediata en el sonido), ¿se acierta en ±0,5 s?
6. **Que el «sube 30 cm» se lea desde el centro de la sala** (es la gracia de levantar y de alzar la mano).

### Lo que necesita al estudio (Beltrán)
1. **Canal visual ↔ sonido** en el runtime (hoy `BroadcastChannel`, apaño del lab). Con verbos continuos la sincronía pesa más: la
   banda la mueve la imagen y la frase de la gralla el sonido.
2. **¿Aguantan los muros a 15 personas apoyando las dos manos?** La Pinya invita a arrimarse. Si no, «Juntaos» sin apoyar: el sensor
   ve la mano a 2 cm igual.
3. **Mapa de audio 4.1 real** (hoy P2 y P3 comparten canal y no hay sub): la llamada entre muros opuestos y el eco deben verse siempre,
   no sólo oírse.
4. **Una sesión en la sala** para fijar umbrales (puntos de arriba).
5. **Validar con una colla o con el XR Lab** las llamadas en catalán («Amunt!», «Pinya!») y el uso de *carregat* / *descarregat*.
6. Fuera de alcance con este sensor: silueta o cuerpo entero, y cualquier interacción desde el centro de la sala (pediría otro
   sensor).
