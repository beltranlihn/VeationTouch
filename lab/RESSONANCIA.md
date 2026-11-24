# Ressonància — la obra y cómo está armada

Barcelona XR Lab × Alma Digital Studio · Vicente · actualizado 24-11-2026 por la tarde · para Beltrán

Ressonància es una obra interactiva de unos 9:30 para la sala VEATION Touch (4 muros, manos por LiDAR, sonido 4.1). El público
construye un castell con el cuerpo: lo levanta, lo sostiene en silencio, lo corona alzando la mano y lo baja. Es guiada (voz, texto
en los muros, manos fantasma que enseñan el gesto), funciona con 2 a 15 personas y nadie tiene que explicarla. Todo se genera en vivo
en Three.js 3D (WebGPU, con WebGL2 de respaldo); no hay vídeo.

**Hoy (24-11) cambiaron dos cosas grandes**, ambas aprobadas por Vicente:
1. **El arte**: dirección «trencadís digital» (`experiments/ressonancia/ARTE-2.md`): cada capítulo es un universo 3D nuevo con
   materia física (cromo, vidrio, cerámica), un guion de color de la noche al amanecer y una transición común en losas de imagen.
2. **La interacción**: a partir de tu propuesta de dramaturgia (`experiments/ressonancia/PLAN-INTERACCION.md` es la respuesta y el
   plan): un verbo distinto por capítulo, nativo del LiDAR, y progreso por lo que hacen las manos, no por reloj.

**Estado:** la obra entera corre de la espera al acta, 0 errores de consola en el último pase de QA (33 tramos, 2 y 6 personas,
WebGPU y WebGL2). Todo el texto en español (palabras castelleras en catalán), voz en español por defecto (inglés en el selector).
Falta lo que sólo da la sala: LiDAR real, 4.1 real, la RTX 6000 Ada y escucharla con la imagen.

---

## 1. Cómo verla

En la raíz del repo, rama `lab/vicente`:

```bash
node lab/harness/serve.mjs
```

| Qué | Dónde |
|---|---|
| **La obra para TOCARLA (sin público virtual)** | http://localhost:8780/experiences/res-obra3d/index.html?sound=ressonancia-sound&demo=0 — el lienzo es la tira real: ratón = mano donde se ve; Mayús + clic fija manos (simular un grupo); B escala corporal; L sensación LiDAR (10 Hz, 150 ms, lecturas perdidas); P panel con «Go to» (saltar a un capítulo) |
| **La obra entera, con público virtual y sonido** | http://localhost:8780/experiences/res-obra3d/review.html — tarjeta de inicio: capítulo, voz (Español / English), 2 / 6 / 15 personas, calidad media (portátil) o alta (sala). Volumen: fader arriba a la derecha o teclas − / + |
| **La obra dentro de un modelo 3D de la sala** | http://localhost:8780/experiences/res-obra3d/sala3d.html — «Dentro» (en el centro a 1,6 m, arrastrar para mirar 360°, rueda = campo de visión) o «Fuera» (orbitar la sala); tecla V cambia. Clic en un muro = una mano; Mayús + arrastrar o tecla M la mantiene |
| Un capítulo suelto con su panel (tecla P) | http://localhost:8780/experiences/res-3d-study/index.html?part=umbral3d (también `brasa3d`, `pinya3d`, `tronc3d`, `pom3d`, `festa3d`, `baixada3d`, `fall3d`, `actatext`) |
| Capturas de toda la obra | `lab/estudio/album3/00-contact.png` (la obra con la interacción nueva; v1–v7 = los gestos nuevos) |
| La versión 2D anterior (respaldo) | http://localhost:8780/experiences/res-obra/ |

---

## 2. La idea

**El lema casteller, «Força, equilibri, valor i seny»:** cuatro valores, cuatro muros, cuatro capítulos jugables.

**«Trencadís digital».** Gaudí rompía cerámica y la volvía a juntar; el *glitch* rompe la imagen en teselas y la reordena: el mismo
gesto. El mundo entero está hecho de teselas que el grupo vuelve a juntar; la fragmentación es la materia de la obra y su firma en las
transiciones.

**El cuerpo recorre el castell.** Las manos del público hacen la trayectoria de una colla: abajo y juntas (pinya) → suben piso a piso
(tronc) → quietas arriba (pom) → una mano en alto (l'aleta) → libres (ressonància) → bajan con cuidado (bajada) → una huella (acta).
La dramaturgia física y la narrativa son la misma curva.

**Guion de color:** noche azul (plaza) → rojo y naranja sobre cromo (Brasa) → turquesa y coral (Pinya) → maqueta blanca con acentos
(Tronc) → líneas blancas y oro (Pom) → oro líquido (coronación y ressonància) → amanecer violeta y melocotón (bajada) → negro (acta).

---

## 3. El recorrido (≈ 9:20 con el público virtual, más la espera)

| Bloque | Verbo | Universo | Duración (mín–máx) |
|---|---|---|---|
| Espera | **jugar** (revelar el botón) | serpentina de trencadís con cuatro puertas | libre |
| Intro: La plaça | (mirar) | la plaza de noche que se rompe en losas de imagen | 70 s |
| I · Brasa | **encender** → **responder a la llamada** | correfoc sobre cromo líquido | 45–75 s |
| II · Pinya — Força | **juntarse** | multitud de puntos y fibras | 50–100 s |
| III · Tronc — Equilibri | **levantar y nivelar** | torre-collage de fragmentos de Barcelona | 85–145 s |
| IV · Pom de dalt — Valor | **callar** | el Eixample como ciudad de líneas; la sala sube 90 m | 70–120 s |
| V · L'aleta | **alzar la mano** | la enxaneta corona; rayos de oro | ventana de 8 s + 25 s |
| V · La ressonància | **jugar → devolver la onda → unísono** | metal líquido de oro (una verbena reflejada) | 60–84 s |
| Bajada — Seny | **bajar** | amanecer de vidrio; flores donde se recoge | 30–50 s |
| Caída (si cae) | — | la torre se rompe en los cuatro muros | 12 s |
| Acta | (huella) | negro y tipografía | 40 s |

Ningún bloque termina antes de su mínimo ni pasa de su máximo. Pasado su tiempo, **la sala ayuda a la vista** (manos fantasma, la
colla de luz), nunca un salto mudo.

---

## 4. Bloque a bloque

### Espera — el umbral
Una serpentina de trencadís real (≈ 3.300 esquirlas con rosetones) rodea la sala; en el centro de cada muro, una **puerta en arco
parabólico** que da a la noche. En reposo es hueso, grafito y espejo; **al tocar, el color se extiende por el rosetón** (una familia
de color por capítulo) y **caen piezas** en espiral que rebotan, se rompen y vuelven coloreadas; sostener la mano tira una columna en
cadena. Jugar revela el botón de inicio dentro de cada puerta (2 personas: 30–50 s; sin nadie no se revela nunca). Muro: «Tocad.
Jugad con la sala.» → «Sostened el anillo para empezar». Al empezar, **la sala atraviesa las cuatro puertas a la vez**.

### Intro — La plaça (70 s)
La plaza del casco antiguo de noche (piedra real CC0, faroles cálidos contra azul noche, reflejos en el adoquín mojado). A los 46 s
**se rompe en losas de imagen en los cuatro muros a la vez**. El lema aparece muro a muro y luego RESSONÀNCIA.

### I · Brasa — encender y responder
El fuego del correfoc **sobre un suelo de cromo líquido** que lo refleja y ondula; columnas de mercurio. Tocar: chorro de chispas,
nace un diable, **caen teselas ardiendo** que salpican y se hunden. Después, **la llamada**: timbal *tok… tok… TOK* (0,8 s) con un
anillo de fuego que se contrae hacia la línea de brasas y llega justo en el TOK. Tocar en la ventana (−0,5/+0,7 s) = ola grande;
fuera = ola pequeña y la sala vuelve a llamar más despacio. Tres llamadas: un muro, dos opuestos, los cuatro. La sala se hunde un poco
en el líquido.

### II · Pinya — juntarse
Una multitud de **cuerpos de puntos turquesa con fibras coral**. **Palma con palma**: donde llega una mano, una figura sale de la
oscuridad y apoya su palma en la del visitante. Las figuras se deslizan hacia el centro del muro y la palma con ellas: el visitante
la sigue; donde falta gente se ven huecos oscuros. El círculo se llena **por lo juntas que están las manos** (una mano que siguió la
palma basta en su muro), no por tiempo; al cerrarse, suben los baixos y la multitud gira en rotllana. Tocar suelta placas de cromo
que caen y ruedan. Manos separadas: la ayuda cierra el círculo hacia los 71 s.

### III · Tronc — levantar y nivelar
La torre es un **collage vertical de fragmentos de Barcelona** (maqueta blanca con acentos de terracota, trencadís, cromo y neón;
un piso por cada uno de los 9). En cada muro de la estructura, una **banda de luz, «los hombros»**, a la altura de las manos: con la
frase musical (4,8 s) las manos **suben** ~30 cm y el piso encaja arriba con su nombre real. Cuenta el ascenso relativo (niños y sillas
igual). Quien no sube es base (menos temblor). Si un lado sube más que otro, **la torre se inclina de verdad** y suelta piezas que
caen. En el penúltimo piso, **el temblor**: 5 s para llevar manos al pie o se pierde un piso. Los muros sin torre tienen una banda
tenue («la plaça»): levantar ahí manda luz a la torre y cuenta la mitad. La sala sube con los pisos. Resultado: 5 a 9 pisos.

### IV · Pom de dalt — callar
**La sala sube de 1,6 a 90 m** por un cañón de edificios dibujados en líneas blancas con jardines de oro, atraviesa una bruma dorada
y sale sobre el Eixample visto como placa de circuito, con el mar. Tres luces (dosos, acotxador, enxaneta) suben por mástiles; la
luz sólo pasa por los muros con **manos quietas** (quietud = la mano se desplaza < 15 cm en 1 s: el temblor del sensor ya no cuenta
como movimiento). Una mano quieta hace florecer un jardín; una que se mueve suelta piezas que caen al vacío.

### V · L'aleta — alzar la mano (el acento de la obra)
Voz: «Ella levanta la mano.» … «Levantad la vuestra.» Arriba de cada muro la enxaneta levanta la mano. Ventana de 8 s: **cada mano
que sube ≥ 28 cm cuenta**; con la mayoría, el castell se corona (si no, al acabar la ventana, más estrecho): de cada mano alzada sube
un rayo de oro. Voz: «El castell está coronado.»

### V · La ressonància — jugar, devolver, unísono
Un **metal líquido dorado que refleja una verbena** (guirnaldas de bombillas). Tres movimientos: **libre** (cada toque una onda y
una nota; la altura decide el tono); **el eco** (cada onda cruza la sala hasta el muro de enfrente, se ve venir ~3 s; si alguien toca
allí al llegar, rebota doblada, una octava arriba); **la llamada final** (*tok-tok-TOK* en los cuatro muros) y **el florecimiento,
siempre**, de tamaño según lo juntos que fueron. Mandalas de arena de oro que se ordenan con la sincronía; esferas de cromo que la
mano lanza.

### La bajada — bajar
Amanecer violeta y melocotón (el sol bajo el horizonte en el muro este), la plaza en silueta. La torre del Tronc se vuelve de vidrio.
Una banda aparece arriba y **las manos la bajan**: los pisos bajan cuando las manos bajan (suave = limpio; de golpe = cruje y se
derraman esquirlas); las esquirlas que una mano recoge florecen en flores de vidrio que se quedan. Soltar tres pisos seguidos o vaciar
la sala: *carregat*.

### La caída y el acta
La caída (*carregat* o *intent*) rompe la torre en fragmentos en los cuatro muros, con brasas y charcos de luz. El acta: «X de Y ·
descarregat» y los cuatro valores, tipografía que se monta con teselas.

---

## 5. Guía (texto, voz y manos fantasma)

- **Escalera de enseñanza:** la sala muestra el gesto → responde a la primera mano en < 100 ms → la voz invita (≤ 7 palabras) → manos
  fantasma de luz hacen el gesto junto a las reales → la colla ayuda pasado el tiempo. Cuando la mitad del grupo hace el gesto
  (`learned`), el texto y las manos fantasma de ese gesto no vuelven.
- **Sin contadores** («2 de 4 muros», «piso 8» desaparecieron). Sí lo diegético: los nombres reales de los pisos, «3 de 7».
- **Muro:** «Tocad el muro» → «Ahora, juntos» (Brasa) · «Buscad un círculo y sostenedlo» (Pinya) · «Levantad» / «Sujetad la base»
  (Tronc) · «Quietos» (Pom) · sin texto en l'aleta · «Bajadlo despacio» (bajada). Tipografía 3D (serif de display + Geist) que se
  arma con teselas; el texto de cada muro espera a que pase la ola de la transición.
- **Botón:** anillo de vidrio con una mano de trencadís; enseña al empezar el bloque y se disuelve en la diana del universo (la palma,
  la banda, el halo).
- **Voz:** 26 líneas originales + 14 nuevas de hoy (ES Mía Evans / EN Lily, ElevenLabs, aprobadas por Vicente); las que pedían
  «pulsar al ritmo» o «sostener los círculos» están silenciadas, no borradas.

---

## 6. Cómo está armada

```
lab/experiments/
├── ressonancia/                 el núcleo compartido
│   ├── GUION.md · ARTE.md · ARTE-2.md · PLAN-INTERACCION.md
│   ├── score.js                 la PARTITURA: toda la obra como máquina de estados pura
│   └── scenes3d/
│       ├── room3d.js            la sala en 3D: CAVE con 4 cámaras off-axis, transición en losas, entornos HDRI, TAA
│       ├── guide3d.js · typo3d.js · fonts/   guía, tipografía 3D, manos fantasma
│       ├── PARTS.md             el contrato de una «parte» y el estado de la partitura
│       ├── assets/cc0/          biblioteca CC0 (Poly Haven; SOURCES.md)
│       └── parts/               un módulo por universo (umbral3d, plaza, brasa3d, pinya3d, tronc3d, pom3d, festa3d, baixada3d, fall3d…)
├── res-obra3d/                  la PIEZA VISUAL (host) + review.html + sala3d.html
├── ressonancia-sound/           la PIEZA DE SONIDO: lleva la partitura (copia idéntica de score.js) y la música
├── res-3d-study/                banco de pruebas de una parte
└── res-obra/                    versión 2D (respaldo) y su público virtual (autopilot.js)
```

- **La partitura** (`score.js`, dos copias idénticas) recibe por mano `{ wall, dx, y, vx, vy, size, s, speed }` y calcula agregados por
  muro (`yMed`, `yL`, `yR`, `span`, `rise`), la línea base de cada mano y su desplazamiento en 1 s, `learned{}` y `assist`. Todo umbral
  es un parámetro (`TIMES`) hasta fijarlo en la sala. Documentado en `PARTS.md`.
- **Manda el sonido:** `ressonancia-sound` ejecuta la partitura y publica su estado en `BroadcastChannel('ressonancia')`; la imagen lo
  sigue (si no llega, corre su propia partitura con las mismas manos). Las partes mandan sus impactos físicos al sonido (`fx:impact`).
  ⚠️ El BroadcastChannel es un apaño del lab: falta el canal oficial imagen ↔ sonido en el runtime.
- **La sala** (`room3d.js`): un ojo en el centro a 1,6 m y una cámara off-axis por muro (Kooima); una tira HDR 7196 × 912; post con
  bloom, ACES y grano; la **transición** renderiza el mundo saliente y el entrante en dos tiras y los compone con losas de imagen
  (tamaños 9:3:1, giro 3–12°, luz por las grietas en el color del capítulo); entorno HDRI por bloque; el bloque siguiente se precompila
  durante el actual.
- **Calidad:** media (portátil) / alta (sala: escala 1, TAA).
- **Sólo se ha tocado `lab/`.**

---

## 7. Rendimiento y pruebas (MacBook M1 Max, medido por QA)

- **Calidad media (fps-eq):** Brasa 49, Pinya 83, Tronc 97, Pom 119, festa 92, bajada 65, intro 75; entrada sola 111 (99 con 15
  manos). **Alta:** 48–88 según bloque. La RTX 6000 Ada de la sala es mucho más rápida.
- **Tirones al cambiar de capítulo:** 60–77 ms en este Mac (objetivo ≤ 30 ms): el coste es el capítulo entrante en su primer
  fotograma, no la transición. Hay que medirlo en la sala.
- **Pruebas:** cada gesto tiene una prueba con el público virtual que **sabe fallar** (p. ej., con manos quietas el Tronc sube 1 piso en
  60 s; con manos que suben, 6). Pase completo: 0 errores en 33 tramos (2 y 6 personas, WebGPU y WebGL2), duración 9:13–9:20.
- Todas las pruebas son mudas: **nadie ha escuchado aún la obra con la imagen**.

## 8. Lo que sólo se ve en la sala

Escala real; la luz en las proyecciones; el 4.1; el LiDAR real; el rendimiento en la RTX. En concreto, validar con el S2E:
1. ¿La **altura** de la mano es estable a ±10 cm a 10 Hz con manos que suben a 0,3–0,45 m/s? (fija `rise`, `still`, `gentle`)
2. **Sombras** con el sensor arriba: fila hombro con hombro (Pinya), manos subiendo en fila (Tronc), treinta manos alzadas (l'aleta),
   adulto junto a niño.
3. **P3** (plano a ~12 cm): entra más antebrazo.
4. Cuánto **tiembla** una mano quieta (umbral del Pom).
5. Las **ventanas** de la llamada y el eco con la latencia real.
6. Que «subir 30 cm» se lea desde el centro de la sala.

## 9. Lo que necesitamos de ti

1. **Canal imagen ↔ sonido** en el runtime (hoy BroadcastChannel). Con gestos continuos la sincronía pesa más.
2. **¿Aguantan los muros** que 15 personas apoyen las dos manos (Pinya)?
3. **Mapa de audio 4.1** real (hoy P2 y P3 comparten canal, sin sub): la llamada entre muros opuestos y el eco deben verse siempre.
4. **Una sesión en la sala** para fijar los umbrales (§8).
5. Validar con una colla o con el XR Lab las palabras castelleras y el uso de *carregat* / *descarregat*.
6. Visto bueno al audio con samples (ElevenLabs) y a la biblioteca CC0 (excepciones a reglas del lab).

## 10. Dónde está el detalle

- `experiments/ressonancia/PLAN-INTERACCION.md` — respuesta a tu propuesta: acuerdos, desacuerdos, plan, validaciones.
- `experiments/ressonancia/ARTE-2.md` y `lab/estudio/notas/ARTE.md` — dirección de arte y biblia de estilo.
- `experiments/ressonancia/GUION.md` — el guion; `scenes3d/PARTS.md` — contrato y estado de la partitura.
- `experiments/res-obra3d/NOTES.md`, `experiments/ressonancia-sound/NOTES.md` — notas técnicas.
- `lab/estudio/` — el proceso: tablero, decisiones (`DECISIONES.md`), turnos, notas de cada agente y álbumes.
