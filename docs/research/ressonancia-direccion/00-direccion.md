# Ressonància — dirección (noche del 24 al 25-11-2026)

Director de la obra esta noche: Claude (sesión «Interactive Director»), por encargo de Beltrán. Estreno el jueves 26; a las
10:00 del 25 la obra tiene que estar instalada y funcionando en la sala. Base: `lab/vicente` 7a056a2. Rama del estudio:
`lab/ressonancia-studio`, en `.data/worktrees/lab-vicente`.

## Lo que pide Beltrán

1. Calidad visual de estudio profesional de animación y experiencias interactivas.
2. **Que se sienta 3D.**
3. Una narrativa interactiva clara, intuitiva y que funcione. El público no está para mover las manos y hacer partículas: forma
   parte de lo que sucede y cuenta la historia. Cada gesto tiene que ser notorio, llamativo y tener consecuencias.
4. La voz en off dirige: dice dónde mirar, qué hacer y qué está pasando. Los textos se colocan y se animan pensando en esta sala.
5. Fácil de entender, llamativa, impactante.

## Decisiones de dirección (no se discuten esta noche)

**D1. La historia no cambia.** El público es la pinya y entre todos levanta un castell: espera, intro, Brasa, Pinya, Tronc, Pom,
l'aleta, coronación, ressonància, bajada, acta. Lo que se rehace es la **puesta en escena** y la **consecuencia**. No se añaden
bloques; si hace falta tiempo, se recorta.

**D2. El castell es del público, y se ve.** Desde la Pinya hay un castell en la sala que crece con lo que hace el grupo. Es la
misma torre todo el rato, y su altura, la estructura y los pisos dependen del gesto. Lo que se consigue se nombra en vivo con voz y
texto («Cuarto piso», «La pinya aguanta», «Coronado»). El resultado final es distinto según lo que se hizo, y el acta lo cuenta.
Las ayudas de la colla existen, pero se ven y se nombran («La colla os ayuda»). Ya no se cierra nada en silencio por reloj.

**D3. Cada mano tiene una respuesta inmediata a escala humana, en el plano del muro.** En menos de 250 ms, algo de ≥ 1 m nace
exactamente bajo la mano y está a 0–2 m tras el muro, no a 8 m: luz que se apoya, una figura que responde, una pieza que encaja,
fuego que prende. Las partículas sueltas no cuentan como respuesta. Lo que importa se queda: deja rastro durante 10–60 s.

**D3b. Posar y sostener, no golpear (Beltrán, 25-11 00:45).**
- El LiDAR no reconoce bien los golpes y no todo el mundo los hace bien. Ningún gesto esencial depende de golpear, de acertar un
  tempo ni de aterrizar en una ventana de tiempo corta. Por ejemplo, la llamada del timbal de la Brasa y de la ressonància deja de
  ser «aterrizar en el TOK».
- **El patrón base son dianas que se activan sosteniendo:**
  - aparecen dianas visibles de ≥ 40 cm en la zona de alcance;
  - se posa la mano encima unos 0,5 s;
  - la diana se carga con una respuesta inmediata (anillo que se llena y sonido);
  - se activa y se mantiene activa otros ~0,5 s;
  - después se enciende la siguiente, en otro sitio o en otro muro, y así se encadena.
- Así se hacen las secuencias, los relevos y las llamadas colectivas:
  - varias dianas a la vez para un grupo;
  - una cadena que recorre la sala para una persona sola.
- **Tolerancia:**
  - si el sensor pierde la mano un instante, la carga no se pierde;
  - no hace falta precisión de píxel;
  - nunca se pide mantener presionado a lo loco ni repetir toques rápidos.
- Tocar libremente sigue dando respuesta, pero la acción que hace avanzar la obra es posar y sostener.
- **Dianas repartidas por toda la sala** (Beltrán, 00:50): siempre hay dianas en varios muros a la vez, para que cualquiera,
  esté donde esté, tenga una al alcance sin cruzar la sala.
- **El número de dianas activas escala con las manos presentes:**
  - 1–2 personas: unas pocas, cerca de ellas, que la cadena recorre;
  - 15 personas: muchas, repartidas por los cuatro muros.
- **Una persona puede usar las dos manos:** dos dianas cercanas, a ~0,6–1,2 m entre sí, se pueden sostener a la vez. Los gestos
  a dos manos son una oferta más, nunca un requisito.
- Ninguna diana queda «secuestrada» por un grupo: si está ocupada, se enciende otra al lado.

**D3c. Botones con forma y momentos libres (Beltrán, 25-11 04:10).**
- **Botones con forma:** las dianas no son siempre anillos. Son objetos del mundo con forma propia: brasero, columna de fuego o de
  luz, bloque, losa, campana, placa, palma.
- **Momentos libres:** hay instancias en las que cada uno toca lo que quiere, sin dianas: la espera, la intro, la fiesta libre y
  la plaza tras la coronación.
- **Siempre hay respuesta:** en cualquier momento, tocar en cualquier sitio da una respuesta bella y propia del capítulo.

**D4. Un solo mundo, una sola materia.** La plaza de noche que evoluciona hasta el amanecer, hecha de cerámica / trencadís
vidriado, cuerpo humano y luz cálida de fuego y oro. Nada de estética CAD ni Tron ni neón de interfaz. Cada capítulo tiene un
etalonaje propio dentro de esa familia.

**D4b. Paletas de autor, no una suma de colores (Beltrán, 25-11 01:00).**
- **Referentes:** teamLab, Refik Anadol, Above & Below; artistas con una línea cromática pensada.
- **Paleta de cada capítulo:** se diseña con intención:
  - 2–3 tonos y un acento;
  - escrita como tokens con nombre (hex y uso);
  - relacionada con el relato y con la curva de luz (D5b).
- **Paleta de toda la obra:** las paletas de los capítulos forman una familia, no ocho mundos.
- **Interacción:** sus colores (dianas, respuesta a la mano, logros) salen de la paleta del capítulo, sin colores de interfaz
  añadidos. El color de «logro» es coherente en toda la obra.
- **Nada de color «porque sí»:** ni arcoíris, ni saturación por defecto, ni acentos que compitan.
- El director aprueba las paletas antes de pintar.

**D4c. New media art, no animación (Beltrán, 25-11 03:15). Manda sobre D4 en lo que choque.**
- **Cuerpos de partículas:** la figura humana es un cuerpo de partículas 3D, tipo *gaussian splat* o nube de puntos volumétrica,
  con luz y volumen. Nunca maniquíes sólidos, que parecen «animación low cost de niños».
- **Las partículas tienen un hogar:** se ensamblan bajo la mano y se disuelven. Ese ensamblaje es la respuesta y el relato: la
  figura que llega a tu palma, el piso que se forma, el piso que se cae como polvo, la enxaneta que se vuelve oro.
- **Referentes:** Refik Anadol, teamLab, Above & Below, capturas volumétricas.
- **Ojo artístico ante todo:** si algo parece videojuego o maqueta, se abstrae.
- **Nada literal (Beltrán, 03:25):** la narrativa se tiene que entender; la imagen no tiene por qué ser literal. Nada de «monos de
  plasticina» ni «lugares de Minecraft».
- **Lugares reales, bien armados (corrección de Beltrán, 03:35):** «Salas y arquitectura real funcionan si se arman bien.» La
  plaza real se queda, de noche, con diseño de luz:
  - focos y haces en la bruma;
  - charcos de luz;
  - perspectiva aérea;
  - sombras ricas.
- **Personajes:** abstractos sí o sí (partículas).
- **Ritmo de mundos (Beltrán, 01:00):** se tiene que sentir el paso entre etapas, alternando lo abstracto y lo real:

  | Etapa | Mundo |
  |---|---|
  | Espera | abstracto |
  | Intro | plaza real |
  | Brasa | plaza real |
  | Pinya | **abstracto** |
  | Tronc | la plaza real se rehace alrededor de la torre |
  | Pom | abstracto |
  | Coronación y fiesta | abstracto, de oro |
  | Bajada | plaza real, a la hora azul |
  | Acta | abstracto |

  **Corrección (02:05, tras dos revisiones del director de arte):** la Pinya abstracta no funcionó («no es un lugar»).
  - **Pinya:** vuelve a la plaza de noche, pero con otro clima: bruma cálida y baja que se traga las fachadas y faroles a ras de
    suelo.
  - **Coronación:** ocurre en la plaza; la torre se vuelve oro de arriba abajo.
  - **Fiesta:** pasa al mundo de oro abstracto.

  Quedan abstractos la espera, el Pom (plaza casi apagada), la fiesta y el acta.

  **Corrección (02:40, revisión de arte nº 8):** la fiesta también ocurre en la plaza, con el oro de la coronación aún en el aire.
  Las ondas y los ecos son oro que recorre el suelo mojado. Fuera el mundo de metal cromado, porque rompía la obra. Quedan
  abstractos la espera y el acta; el Pom pasa en la plaza casi apagada.
- **Arquitectura de día (Beltrán, 04:30):** puede haberla, pero tiene que estar muy bien lograda y la aprueba el director de arte
  revisor antes de que entre en la obra. Si no la aprueba, queda la versión de noche.
- **Quién cuenta la historia:** la cuentan la voz, el texto y la estructura (torre, pisos, pinya), no el atrezo.

- **Aprobación de los cuerpos (Beltrán, 01:15, se va a dormir):** el director de arte revisor decide si aprueba los cuerpos de
  partículas basados en el modelo humano de Quaternius o si se mantienen los anteriores (bodies3).

**D5. 3D de verdad.** Hay que leer profundidad, volumen y luz:
- un ojo en el centro a 1,6 m, con el horizonte a la altura de los ojos;
- primer plano (0–2 m), plano medio y fondo;
- luz que modela: sombras, oclusión de contacto, rim;
- niebla atmosférica y volumétricos;
- los cuerpos sólidos e iluminados, nunca nubes de puntos;
- la torre con suelo y sombra;
- la altura del muro llena, con cielo, humo y arquitectura, en lugar de media altura en negro.

**D5b. Menos negro: luz clara contra sombra profunda (Beltrán, 25-11 00:40).**
- No todo pasa sobre fondo negro.
- Hay momentos con fondos y mundos claros: cal, piedra al sol, cielo de amanecer, porcelana, niebla luminosa. Sobre ellos, sombras
  oscuras y marcadas.
- La profundidad sale del contraste entre valores claros y sombras, no de figuras brillantes flotando en el vacío.
- **Curva de luminosidad de la obra:** a lo largo del pase alterna noche y luz, por ejemplo:
  - la Pinya o el Tronc a la luz de la plaza;
  - la coronación luminosa;
  - la bajada al amanecer.
- Todo con tone mapping bien calibrado para proyector, sin quemar blancos.

- **Corrección de Beltrán (25-11 03:20):** la plaza de día se ve plana. Funciona mejor la **noche con luces**: profundidad, a
  veces niebla. Pinya y Tronc pasan a ser una noche de fiesta castellera:
  - focos cálidos sobre la torre y la pinya;
  - haces de luz en la bruma;
  - charcos de luz de farol;
  - fachadas lejanas hundidas en niebla azul.
- Lo claro aparece **donde cae la luz**; la coronación es un estallido de oro dentro de la noche; el único día es el amanecer de la
  bajada.

**D6. La voz es la regidora.**
- **Qué dice:** por fase, una línea de tarea, una de confirmación y otra de qué ha pasado. Corta, en imperativo cuando pide algo.
- **Por dónde suena:** cuando señala un lugar, suena **en el muro que llama** (`wallInput`). La narración suena por toda la sala.
- **Energía:** varía, del susurro del silencio del Pom a la euforia de la fiesta.
- **Producción:** las líneas que falten se generan con ElevenLabs con **la misma voz y el mismo idioma que ya usa Vicente**.

**D6b. Un solo sonido, en la misma tonalidad (Beltrán, 25-11 00:55).**
- La música grabada (stems mp3) y todo lo generativo tienen que estar en la **misma tonalidad y el mismo tempo** de cada capítulo:
  las notas de las dianas, las campanas, los timbales, las respuestas a la mano y los efectos con altura.
- **Tonalidad y tempo de cada stem:** se averiguan analizando el audio y la partitura de Vicente, no se suponen. Lo generativo
  usa sólo notas de esa escala y se ajusta al pulso, o queda fuera de pulso a propósito.
- **Efectos sin altura** (fuego, golpes, multitud): se filtran o afinan para no ensuciar.
- **Mezcla:** la voz siempre por encima. Lo generativo nunca compite con la música por las mismas frecuencias y se reparte con
  sidechain o EQ.
- **Resultado:** música, no una suma de ruidos. Con 15 manos a la vez sigue sonando como un acorde, no como un caos; las voces
  están limitadas y caen en la escala.

**D7. El texto vive donde está la acción.**
- **Consigna:** a 1,4–1,8 m de altura, con mayúscula ≥ 0,18 m.
- **Cartela de capítulo:** centrada a ≤ 2,1 m.
- **Muro de la acción:** el texto aparece primero en el muro que llama o que necesita ayuda; los otros muros muestran como mucho
  un eco tenue.
- **Animación con sentido:** el texto viaja con el relevo, sube con los pisos y se rompe en teselas al cumplirse.
- **Nada de metadatos:** ni reglas, ni «P4», ni «1,25 m».

**D8. De 1–2 a 15 personas, sin bloqueos (Beltrán, 25-11 00:20).**
- En la sala puede haber 2 personas o 15. Ni las ofertas de interacción ni el avance de la obra pueden depender de cuántas haya.
- **Con 1–2 personas:** cada bloque se completa con su consecuencia plena. Ningún quórum, ventana, muro ni recorrido exige más
  manos de las que hay. Ejemplos: el relevo de la Brasa, el cierre de la Pinya, nivelar, el silencio del Pom.
- **Con 10–15 personas:** el bloque no se satura, nadie queda sin respuesta propia y la obra no se acelera ni se bloquea. Por
  ejemplo, una persona que se mueve no arruina el silencio de catorce.
- **Escalado:** todo umbral colectivo se escala con las manos presentes (fracciones con mínimos y topes). Las ofertas se
  multiplican con el grupo: más focos, más relevos simultáneos, más muros activos. En solitario se concentran en el muro de la
  persona.
- **Tope de recursos:** el visual tiene un tope razonable por mano, ~16 manos con respuesta plena; por encima se agregan.
- Se prueba con 1, 2, 4, 8 y 15 manos virtuales.
- Un niño (0,6–1,4 m) puede hacer todo lo esencial.

**D9. Técnica innegociable.**
- 60 fps a 7196×912 en la sala.
- La instancia del visor no emite.
- El manifiesto cumple el contrato (≤ 64 parámetros).
- Sin costura en P3→P4.
- Arranque en negro lo más corto posible: compilar mientras suena algo.
- Plan B probado (calidad media).

**D10. Reglas del equipo.**
- Cada agente es dueño de sus archivos y no edita los de otro: si necesita algo, lo pide al director.
- Commits pequeños en `lab/ressonancia-studio` (`Studio: …`).
- La GPU se comparte con el equipo de Unreal: un render a la vez y a escala 0,5 salvo mediciones autorizadas.
- Las capturas se miran siempre: un smoke test limpio no basta.
