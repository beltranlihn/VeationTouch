# ARTE — dirección de arte de Ressonància (ola «Arte 2», 24-11)

Yo no construyo: miro, comparo con las 7 referencias y con `ARTE-2.md`, y escribo notas para cada constructor. El director las reparte.
Cada sección de pieza lleva hora, veredicto en una línea, cambios **por orden de importancia** y lo que se conserva.
Mis imágenes de trabajo: `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/arte/`.

---

# BIBLIA DE ARTE (una página — todos los constructores)

**La idea en una frase.** *Trencadís digital*: todo en la obra está hecho de teselas que se rompen y se vuelven a juntar. Si una imagen
no deja ver «piezas con canto, con peso y con brillo», no es de esta obra.

**La prueba de los 3 segundos** (así juzgo cada captura): 1) ¿hay **una** masa protagonista que se lee desde 3,5 m? 2) ¿hay **luz**
(una principal, un contraluz de otro color, sombra entre las cosas) o sólo objetos emisivos sobre negro? 3) ¿hay **materia** (cromo que
refleja algo, esmalte con canto brillante, vidrio que deforma lo de detrás)? Tres síes = «pro». Hoy casi todo falla en 1 y 2.

## 1. Tres familias de materia (cada capítulo: 70 % una, 25 % otra, 5 % la tercera)
| Familia | Receta (MeshPhysical / TSL equivalente) | No vale |
|---|---|---|
| **Cerámica esmaltada** (tesela) | forma **irregular** de plato roto (4–7 lados, ninguno igual), grosor 8–14 mm, **bisel 1–1,5 mm que atrapa la luz**; cara: `roughness 0.35`, `clearcoat 1`, `clearcoatRoughness 0.06–0.12`, craquelado en la normal; canto y reverso: terracota `#B5583A`, `roughness 0.9` | hexágonos regulares, caras planas sin canto, colores al azar |
| **Cromo / vidrio / iridiscencia** | cromo: `metalness 1`, `roughness 0.04–0.08`, `envMapIntensity 1.4–1.8`, base `#F4F6FA`; vidrio: `transmission 1`, `ior 1.45`, `thickness 0.2–0.6`, `roughness 0.03–0.1`, `iridescence 0.6–1` (`iridescenceIOR 1.3`, 200–600 nm). **Vidrio barato** si no hay pase de transmisión: `env(refract(v,n,1/1.45))·tinte·0.9 + env(reflect)·fresnel + película fina en el borde` | vidrio sólo aditivo (parece holograma), cromo sin nada que reflejar |
| **Luz** (puntos, líneas, fibras, chispas, paneles) | emisivo HDR 1,5–4 sólo en cosas **finas o pequeñas**; fibras 5–12 mm de ancho en el muro, color hueso `#F0D9C4`; puntos 3–8 mm | placas emisivas grandes quemadas a blanco; líneas de 1 px (centellean: mínimo **1,5 px = 6 mm** a escala 1) |

**El cromo necesita un mundo que reflejar**: `room.envMap` teñido por capítulo (tabla §2, columna «cielo del entorno») y siempre con una
zona **fría y clara** arriba y una **cálida** abajo: sin ese contraste el cromo se lee como suelo mojado, no como metal (mirad ref. 8).

## 2. Guion de color (hex) — nadie usa un color que no esté en su fila
| Bloque | Fondo | Dominante | Secundario | Acento (≤ 5 %) | Cielo del entorno (para cromo) | Contraluz |
|---|---|---|---|---|---|---|
| Espera (umbral) | `#050506` | hueso `#F1ECE2`, grafito `#1A1B20`, cromo | brasa `#FF6B2E` (una línea) | el color **sólo aparece al tocar**: cobalto `#2146B0`, turquesa `#2BB8B0`, ocre `#E3A32B`, sangre `#B5342A`, rosa `#F7B7C6` | gris plata `#AEB8C8` 10 % | `#FF6B2E` |
| Intro (la plaça) | `#0B1430` → `#1B2A52` | azul noche | farol `#FFB25A` | fuga iridiscente `#8FE3FF → #F2A6C8 → #F6D47A` | azul `#3A4E86` | `#FFB25A` |
| I Brasa | `#0A0504` | rojo `#E0301A`, naranja `#FF6A1F` | cromo líquido | chispa `#FFF1C8` | plata fría `#9FB4D8` 8–12 % arriba, brasa abajo | frío `#5A6C8C` |
| II Pinya | `#03090B` | turquesa `#2ED3C6` (calma), teal `#0E5F66` (lejos) | coral `#FF6F59` (donde hay manos) | hueso `#F0D9C4` (fibras), rojo `#E23B2E` (nudos) | teal `#12444A` | coral `#FF6F59` |
| III Tronc | `#07080C` | terracota `#C4623A`, esmalte (cobalto `#2146B0`, turquesa `#2BB8B0`, ocre `#E3A32B`, blanco `#F1ECE2`) | cromo, vidrio | neón de panel: lima `#E9F27A`, cian `#8FD8FF` | humo teal `#1C5E66` + cálido `#B8562C` | turquesa `#2ED3C6` |
| IV Pom | `#020308`, cielo `#0A1230` | línea blanca `#EEF2FF` (3 grosores) | oro de jardín `#FFD27A` / `#F2B84B` | hoja `#20382C` (casi sin luz) | azul profundo | oro |
| V Corona + Ressonància | `#060504` | oro `#F6C65B`, blanco `#FFF6E0` | cromo, vidrio | iridiscencia `#F2A6C8` · `#8FE3FF` · `#B9A3FF` | oro pálido | lila `#B9A3FF` |
| Bajada | **no negro**: `#2A2140` arriba → `#F3B9B0` en el horizonte | rosa `#F7B7C6`, lila `#B9A3E8` | aguamarina `#8FE0D2`, melocotón `#FFD0A8` | blanco sol `#FFF6E0` | amanecer | melocotón |
| Acta | `#050506` | tinta `#F2EEE6` | — | una línea por capítulo: `#FF6A1F` · `#2ED3C6` · `#C4623A` · `#EEF2FF` · `#F6C65B` · `#F7B7C6` | — | — |

El arco: **negro y brasa → turquesa/coral → tierra y esmalte → blanco sobre negro → oro → pastel con cielo claro**. La luminancia media
sube sólo dos veces: en la coronación y en la bajada (la única con fondo claro). Si tu capítulo es más brillante que el siguiente, bájalo.

## 3. Luz (la misma lógica en los cuatro muros)
- **Principal cenital**, desde el centro-alto de la sala hacia fuera (una lámpara sobre la plaza): así cada muro ve sus objetos iluminados
  desde arriba y desde el público. Color cálido del capítulo, intensidad alta.
- **Contraluz** desde detrás y debajo de los objetos (lado contrario al público), del color complementario de la tabla: dibuja el borde
  de cada silueta contra el negro. Sin contraluz, todo se funde con el fondo.
- **Relleno ≤ 10 %** (el entorno). Negros de verdad: lo que no está iluminado es `#000`, el proyector no «levanta» nada.
- **Sombra de contacto / AO** entre piezas que se apoyan (una franja oscura de 2–5 cm): es lo que da peso. Sin ella, flotan como pegatinas.
- **Humo de color** detrás de la masa protagonista (ref. 9: velos azul-gris, naranja, rosa), 15–20 % de luminancia, nunca delante del texto.
- **Nada quemado**: ninguna zona blanca plana mayor de 15 cm en el muro. El bloom sólo sobre HDR > 1.

## 4. Profundidad, escala y sala
- **Tres capas siempre**: *cerca* 0–1 m tras el muro (pocas piezas: ≤ 8 por muro, de 8–30 cm, es lo que da paralaje cuando la sala se
  mueve) · *universo* 3–10 m (la masa protagonista) · *lejos* 25–80 m (formas grandes y simples, contraste 30 %, teñidas del color del aire).
- **Protagonista**: ocupa ≥ 55 % de la altura del muro y ≥ 1,8 m de ancho en el muro. Nada importante más fino que 0,8 m.
- **Jerarquía de tamaños 1 : 3 : 9**: unas pocas piezas grandes, bastantes medianas, polvo. Jamás «lluvia uniforme» de piezas iguales
  (cubos de alambre, cuadraditos, hexágonos repartidos por igual = ruido; es el defecto más repetido hoy).
- **Banda de las manos 0,9–1,6 m**: ahí va lo que se toca y lo que responde. El botón (centro del muro, 1,25 m) tiene una columna libre de
  ±0,9 m. El texto vive entre 1,75 y 2,15 m. Horizonte / línea de ojos a 1,5–1,6 m.
- **Dos zonas tranquilas en el centro de cada muro** (añadido 13:38): la del texto (±1,6 m × 1,75–2,2 m) y la del botón (±0,9 m ×
  0,9–1,6 m). Detrás de ellas, ninguna superficie por encima del 35 % de luminancia y nada blanco. La placa de GUI no arregla un fondo quemado.
- **360°**: ningún muro vacío. Si el castell está en 2 muros, los otros 2 llevan capa lejana y media (otras torres a lo lejos, cúmulos).
  Nada protagonista a menos de 0,5 m de una esquina; las fibras, el horizonte y la capa lejana **sí** cruzan las esquinas y la costura.

## 5. Movimiento
- **Llegar**: rápido y asentar despacio (`easeOutCubic`/`Expo`, 0,6–1,2 s). **Irse**: `easeInCubic`, 0,4–0,6 s. Nada lineal.
- **Física creíble**: gravedad 6 m/s² (0,6 g: soñado pero con peso); restitución cerámica 0,3–0,45, arcilla 0,15, cromo 0,6; giro al
  chocar; la cerámica **se parte en 3–7 esquirlas**; los muelles oscilan 2–3 veces (1,2–2 Hz, amortiguación 0,35–0,5).
- **Tocar**: en < 100 ms un destello y un salto de escala del 8–12 % justo bajo la mano; después, la física.
- **Sala**: ≤ 0,35 m/s, aceleración ≤ 0,25 m/s², giro ≤ 6°/s, entrada y salida de ≥ 1,5 s, nunca cabeceo ni alabeo. Sin capa cercana
  no se nota el movimiento: es obligatoria.
- **Reposo**: todo respira (8–12 s, ±3–5 %). Nada inmóvil, nada nervioso.

## 6. Tipografía (GUI dibuja; los demás le dejan sitio)
- **Instrument Serif** para títulos y cartelas (regular; itálica para el valor) · **Geist 400** para instrucciones (frase, no mayúsculas)
  · **Geist 500 versalitas** para etiquetas (tracking +16 %).
- Tamaños en el muro (altura de mayúscula): título de obra ≥ 0,45 m · cartela de capítulo 0,30–0,34 m · instrucción 0,10–0,12 m ·
  etiqueta ≥ 0,055 m. Instrucción: máximo 2 líneas de ≤ 28 caracteres, **una sola pieza centrada**, nunca partida a los lados de la torre.
- Color tinta `#F2EEE6` al 92 % (secundario 60 %). **Sin halo de neón**: resplandor ≤ 0,06 × altura de mayúscula al 35 %; la riqueza la
  da el barrido de película fina y la llegada por teselas, no el bloom.
- Movimiento: llegada 0,9 s, 35 ms de desfase por letra, `easeOutExpo`, tracking de +12 % a 0; salida 0,5 s; el filete se dibuja del
  centro hacia fuera en 0,6 s.

## 7. Botones y transición (un solo lenguaje)
- **Botón**: toro de vidrio de verdad (radio 0,21–0,24 m, sección 2 cm), disco interior de vidrio esmerilado oscuro al 35 %, mano en
  línea fina limpia (5 mm, 85 %). En reposo es **lo más brillante de la banda 0,9–1,6 m** y late cada 2,4 s. Progreso: teselas del color del capítulo.
- **Transición**: las teselas **llevan imagen** (trozos desplazados y estirados del mundo que se va, refs. 13 y 14), nunca agujeros
  negros; por las grietas se escapa luz iridiscente; una **ola que da la vuelta a la sala** desde un muro (1,4 s en recorrer los 27,6 m),
  pico al 45 % de los 4 s.

---

# REVISIÓN DE BASE — 24-11, 13:10

## 0. El «antes» (álbum de anoche, `lab/estudio/album/`)
Confirmo el diagnóstico de `ARTE-2.md` y añado lo que veo:
- **Lo mejor del álbum** es la intro (02): es la única imagen con luz de verdad (faroles, aire, suelo que refleja) y con la plaza
  rompiéndose en placas. Esa calidad de luz es el listón para todo lo demás.
- 03 Brasa: figuras de fuego bonitas, pero una franja horizontal en mitad del muro y negro arriba y abajo (60 % del muro vacío).
- 04 Pinya: maniquíes; friso plano. 05 Tronc y 09 Bajada: la torre es un palo fino de puntos delante de la plaza. 06 Pom: edificios
  de caja con ventanas, luz plana, sin vértigo. 08 Festa: curvas de nivel doradas en 2D: bonito como gráfico, cero 3D.
- Texto del álbum: mayúsculas sans con resplandor = HUD. Ya superado por GUI hoy.

## 1. Estado de hoy, pieza a pieza (primeras versiones, 13:00)

### ENT — entrada `umbral3d` · 13:10
**Veredicto: todavía no.** Es rica y es libre, pero se lee como confeti: cien hexágonos planos del mismo tamaño repartidos por igual,
con placas blancas quemadas. Tiene la idea correcta (teselas colgadas de hilos, suelo de mosaico, anillo de trencadís) sin jerarquía ni materia.
Capturas vistas: `umbral3d/shots/01–04`, `scratchpad/ent/u6b.png`.
1. **Jerarquía y composición (lo primero).** Hoy ~110 piezas por muro de 10–25 cm, todas iguales. Pasar a 1 : 3 : 9 → por muro **5–7 piezas
   madre de 0,5–0,9 m**, 20–30 medianas de 0,18–0,3 m y polvo < 5 cm. Agrupadas en **3 móviles por muro** (como un Calder: una barra,
   contrapesos, piezas a distinta altura) con oscuridad entre ellos, a cuatro profundidades (0,3 · 1,5 · 4 · 9 m). Columna del botón libre (±0,9 m).
2. **Materia.** Fuera el hexágono regular: esquirlas irregulares de plato roto con bisel (biblia §1). 1 de cada 5 piezas, **cromo espejo**;
   1 de cada 8, **vidrio iridiscente**. Fuera las placas emisivas blancas: el brillo lo pone un **faro**: una luz principal que da la vuelta a
   la sala cada 24 s (15°/s), de modo que los destellos especulares recorren los cuatro muros uno tras otro. Eso es «mostrar el despliegue de
   la sala» sin texto: la gente gira la cabeza siguiendo el brillo.
3. **Color = recompensa.** En reposo, sólo hueso `#F1ECE2`, grafito `#1A1B20`, cromo y la línea de brasa `#FF6B2E`. El color vive en el
   **reverso** de cada pieza: al tocarla gira y enseña su cara esmaltada (cobalto, turquesa, ocre, sangre, rosa — los colores de los capítulos
   que vienen) y se queda así 20–30 s. La sala se va coloreando con el juego del grupo y `reveal` es, literalmente, cuánto color hay. Hoy el
   morado, el verde y el rosa están desde el principio y no significan nada.
4. **Suelo = espejo oscuro.** El mosaico del suelo está bien pensado pero se ve como manchas planas. Hacerlo piedra mojada (`metalness 0.9`,
   `roughness 0.15`, teselas con junta oscura de 1 cm) que **refleja los móviles**: duplica la riqueza gratis. La banda naranja del horizonte
   es demasiado gruesa: línea de brasa de 2 cm con caída de 0,25 m, a 1,05 m del suelo.
5. **Hilos.** Hoy son rayas blancas de 1 px hasta el techo (parecen lluvia). Hilo cálido `#FFD9B0` al 25 %, ≥ 1,5 px, sólo en los móviles,
   con balanceo; al cortar una pieza el hilo **da un latigazo** hacia arriba.
6. **Interacciones que dan ganas de repetir** (por orden de impacto): (a) **péndulo con reacción en cadena**: empujar una pieza madre la
   balancea (periodo 2,5–3,5 s) y golpea a sus vecinas, que suenan; (b) **cortar**: mano sostenida 0,6 s sobre un hilo → la pieza cae, se
   parte en 3–7 esquirlas contra el suelo espejo y las esquirlas resbalan; (c) las esquirlas caídas **se arrastran por el suelo hasta el
   centro del muro y montan el anillo del botón** (la revelación se ve suceder en el mundo); (d) las piezas de cromo lanzan **manchas de
   luz** que cruzan a los otros muros cuando giran.
**Conservar:** el anillo de trencadís alrededor del botón, la idea de colgar de hilos, el suelo de mosaico, los sonidos por material.

### 3D-FE — Tronc, la torre-ensamblaje · 13:10
**Veredicto: todavía no.** Se lee como un tótem de primitivas (cono, hexágono, cilindro, cajas) flotando en negro: «prototipo de motor de
juego». Sólo el piso de la esfera de cromo con su anillo de oro y el balcón tienen nivel. Refs. 9 y 10: masas anchas, asimétricas, con
humo de color, fibras y paneles de luz. Capturas vistas: `tronc/g_board.png`, `h_f9.png`, `h_f9_p3.png`, `g_f5lean.png`, `h_obra2.png`.
1. **Masa y asimetría: la torre es un equilibrio, no una columna.** Hoy mide ~0,9 m de ancho en el muro y es coaxial. Cada piso debe ser un
   **cúmulo de 2–3 m de ancho**, desplazado ±0,4 m del eje y contrapesado por el siguiente (un cairn, un Calder apilado): que se *vea* que
   se sostiene por equilibrio. Es el tema del capítulo. Voladizos, un piso que asoma mucho por un lado y una esfera pesada al otro.
2. **Fragmentos de Barcelona reconocibles, no primitivas.** Sustituir: cono → **chimenea de Gaudí** helicoidal con trencadís; hexágono →
   losa de **panot** (la baldosa de la flor de cuatro pétalos: se reconoce al instante y es una tesela); caja de vidrio → **tribuna de
   vidrio y hierro** del Eixample; tambor de ladrillo → **tramo de fachada con persiana** y media ventana; añadir un **farol**, un tramo de
   **escalera de caracol**, un **rosetón**. Cada uno con canto, bisel y junta (biblia §1).
3. **Luz y aire.** Ahora la luz es plana y el fondo, negro: las piezas no se despegan. Principal cenital cálida `#FFD2A0`, contraluz
   turquesa `#2ED3C6` desde detrás-abajo (borde de luz en cada silueta), **sombra de contacto** entre pisos (franja oscura de 3–5 cm) y una
   **columna de humo** iluminada detrás de cada torre (3 m de ancho, teal `#1C5E66` abajo y cálido `#B8562C` a media altura, 15–20 %).
4. **Fibras en lugar de palos.** Las líneas naranjas verticales de 1 px son rayas. Ref. 10: **haces de 30–60 fibras curvas** color hueso
   `#F0D9C4`, 5–10 mm, que cuelgan de la panza de cada piso como raíces, atan un piso con otro y se tensan cuando la torre se inclina.
5. **Los cuerpos son de puntos.** El corro de «bolos beige» rompe la identidad. Usar los **cuerpos de nube de puntos de la Pinya**
   (turquesa/coral): la torre lleva gente dentro, y es la misma gente del capítulo anterior.
6. **Paneles de luz** (ref. 9): 2–3 rectángulos por torre, 0,3 × 0,8 m, lima `#E9F27A` o cian `#8FD8FF`, con tiras de *pixel sorting*, que
   **iluminan** lo que tienen cerca. Los paneles actuales se leen como madera.
7. **Los muros sin torre.** Con castell en 2 muros, P2 y P3 quedan vacíos (ver `h_obra2.png`). Poner en la capa lejana (25–40 m) las
   **torres de otras colles** en silueta y un cúmulo mediano por muro.
**Conservar:** la esfera de cromo con anillo y satélites, el balcón con macetas, toda la física (inclinación → las piezas resbalan y caen;
la mano golpea el piso), la caída del piso con muelle, la subida de la sala.

### 3D-PI — Pinya de puntos y fibras · 13:10
**Veredicto: casi identitaria, todavía no pro.** Los cuerpos de puntos turquesa/coral ya son de la familia de la ref. 10, pero la imagen
es un **friso plano**: una fila de gente de la misma altura y el mismo brillo, con el 40 % de arriba y el 25 % de abajo vacíos.
Capturas vistas: `pinya3d/a2/closed_s.png`, `closed_p1.png`, `caps-gui/c-pinya-burst.png`.
1. **Profundidad: estamos dentro de la pinya.** Primera fila a 1,2–2 m, a tamaño real (cabezas a 1,6–1,75 m en el muro), con el doble de
   densidad de puntos; filas hacia atrás hasta 15 m que se apagan hacia teal `#0E5F66` (30 % de contraste al fondo). Hoy todas brillan igual.
2. **Faltan las fibras, que son la mitad de la idea.** Haces gruesos color hueso `#F0D9C4` (5–12 mm) de hombro a hombro y de brazo a
   espalda (así se agarra una pinya), que **crecen hacia cada mano**; al sostener se tensan y se encienden; al cerrar el círculo, una
   trenza de fibras da la vuelta a la sala.
3. **Color con sentido.** El coral ahora es salmón pálido. Turquesa `#2ED3C6` = calma; coral `#FF6F59` = donde hay manos y fuerza (el
   color viaja por las fibras desde la mano); nudos rojos `#E23B2E` en los cruces (5 %).
4. **El cielo: una sola forma grande.** Los cubos de alambre repartidos al azar son ruido. En su lugar, una **nube de puntos en espiral**
   (el toro turquesa/coral de la ref. 10, 6–10 m de diámetro, 10–14 m de distancia) sobre la multitud, girando 3°/s, y los cubos con un
   punto dentro (ref. 10) sólo en una rejilla ordenada al fondo.
5. **Interacción física**: al apretar, los cuerpos cercanos **se inclinan 10–15 cm hacia la mano** y la onda de apretón se propaga
   (0,8 m/s); al soltar, los puntos de esos cuerpos **se desgranan como arena**, caen, rebotan en el suelo de rejilla y vuelven a subir.
**Conservar:** los cuerpos de puntos, el suelo de rejilla, la dirección de paleta.

### 3D-PO — Pom, ciudad de líneas · 13:10
**Veredicto: la más cercana a su referencia (11), todavía no pro.** El concepto está; falla el dibujo: todas las líneas pesan lo mismo y
hay una nieve de cuadraditos encima. Capturas vistas: `t031/board-v1.png`.
1. **Tres grosores de línea.** Siluetas y aristas del primer plano: 2,5–3 px, blanco `#EEF2FF` al 90 % · forjados y ventanas: 1,5 px al
   45 % · trazas de circuito: 1,5 px al 22 %. Los edificios lejanos, todo al 25 %. Hoy todo es ~1 px al 60 % = maraña gris.
2. **Que sea circuito de verdad** (ref. 11): **buses de 3–5 líneas paralelas** bajando por las fachadas, giros a 45°, terminadas en
   **pastillas** (círculos pequeños); **pulsos de oro** que corren por las trazas hacia los jardines (1,5 m/s).
3. **Jardines grandes y vivos**: son el único color. 6–10 por muro, de 1,5–3 m, que se desbordan por el borde de las azoteas: umbelas
   blancas `#FFF2D0` con resplandor oro `#FFD27A` y masas de hoja casi negras `#20382C` con borde de luz. **Florecen al paso de la luz** de
   la enxaneta (ése es el premio).
4. **Fuera el 70 % de los cuadraditos flotantes.** Dejar 6–10 teselas por muro en la capa cercana (8–20 cm), que son las que dan paralaje.
5. **El cañón y la cima.** Para que la subida dé vértigo: edificios **altos y cercanos** (4–8 m) a los lados de cada muro con una
   rendija de cielo en medio (ref. 11). Arriba, el premio: **el Eixample visto desde lo alto como una placa de circuito** hasta el
   horizonte — manzanas octogonales con sus chaflanes en línea doble, patios interiores como jardines de oro, la Diagonal cruzándolo.
   La fila 3 del tablero (cielo vacío sobre rejilla gris) aún no es ese premio.
6. **La luz de la enxaneta**: ahora es una mancha borrosa tipo sol. Estrella pequeña y nítida (núcleo 6 cm, destello de 4 puntas) con hilo de oro fino.
**Conservar:** edificios negros con línea blanca (línea oculta), el oro sobre blanco, la subida.

### 3D-BR — Brasa sobre cromo líquido · 13:10
**Veredicto: la que más «pro» se ve hoy** (las figuras de fuego reflejadas son una imagen fuerte), **pero el cromo aún no es cromo**: se
lee como suelo mojado oscuro. Capturas vistas: `brasa3d/t029/tap_board.png`, `a5_p1.png`, `obra_lv_board.png`.
1. **Que el metal sea metal** (ref. 8). (a) Entorno con cielo plata frío `#9FB4D8` al 8–12 % arriba: aparecen bandas plateadas entre los
   reflejos naranjas; (b) reflectividad alta en todos los ángulos (hoy cae a negro como el agua); (c) **mar de fondo** lento (longitud 1,5–3 m,
   amplitud 4–8 cm) más ondas de cada mano (anillo a 0,6 m/s, 3 crestas, 4 s).
2. **Subir el horizonte a 1,0–1,1 m**: el cromo ocupa el tercio inferior y **las manos tocan el metal** (banda 0,9–1,3 m). Ahora el suelo
   queda bajo la banda de las manos y la mitad de arriba es negra.
3. **Cromo vertical**: 3–4 **columnas o gotas de cromo** por muro que suben del suelo hasta 1,5–2,5 m (las siluetas onduladas oscuras del
   fondo ya lo insinúan: hacerlas metal con borde de luz frío `#5A6C8C`), reflejando el fuego.
4. **Las teselas rojas** son polígonos rojos planos. Hacerlas **brasas de cerámica**: costra oscura `#2A0C08` con grietas encendidas
   `#FF5A1F`, esmalte con brillo; al tocarlas se abren, caen al cromo con un anillo de salpicadura y se hunden brillando.
5. **Arriba**: humo iluminado desde abajo (`#7A2A12` → transparente, hasta 2,6 m) y surtidores de chispas hasta 2,8 m. Chispas con
   temperatura: `#FFF1C8` → `#FF7A1F` → `#C02010` a lo largo de su vida.
6. **Romper la franja**: la banda de lava continua a media altura es una raya que rodea la sala. En charcos, con zonas de cromo oscuro entre ellos.
**Conservar:** las figuras de fuego y su reflejo, las chispas, la oscuridad.

### GUI — tipografía y botones · 13:10
**Veredicto: tipografía sí** (Instrument Serif + Geist, cartela de cine: es moderna y es de la obra); **botón todavía no** (se lee como
círculo de interfaz a trazos, no como objeto de vidrio). Capturas vistas: `caps-gui/c-*.png`.
1. **Quitar el halo de neón.** «Ressonància» y «Tronc» llevan un resplandor blanco de ~0,4 × la altura de la letra: rótulo luminoso.
   Bajarlo a ≤ 0,06 × al 35 %. La letra, hueso `#F2EEE6` al 92 %, con el barrido de película fina como único lujo.
2. **Una instrucción, una pieza.** En Tronc la frase va partida a izquierda y derecha y choca con la torre y los anillos
   (`c-tronc-both-sides.png`). Una sola línea centrada con base a 2,05 m («Mantened la torre recta»), la segunda idea debajo en etiqueta.
   Texto siempre entre 1,75 y 2,15 m.
3. **El anillo, vidrio de verdad.** Toro continuo (radio 0,21–0,24 m, sección 2 cm) que **deforma lo que hay detrás** (refracción del
   fondo o del entorno), borde de Fresnel fuerte y **un** reflejo nítido que se desplaza; disco interior esmerilado oscuro al 35 %; la mano
   en línea limpia de 5 mm al 85 % (la actual parece un boceto tembloroso). Las teselas de progreso, bien: mantenerlas, de 3 × 5 cm.
4. **Movimiento con más oficio**: 35 ms de desfase por letra, `easeOutExpo`, tracking +12 % → 0; el valor en itálica («Equilibrio»)
   **sube desde detrás de una máscara** en la línea base, no aparece por opacidad; el filete se dibuja del centro hacia fuera en 0,6 s; el
   romano entra 0,2 s antes.
5. **Tamaños**: título de obra ≥ 0,45 m de mayúscula; etiqueta («QUARTS · PISO 4») ≥ 5,5 cm, hoy ronda 5.
**Conservar:** la pareja de fuentes, la composición de la cartela (romano · nombre · filete · valor), la llegada por teselas, la placa oscura suave.

### INT — transición por teselas, ojo, hilo · 13:10
**Veredicto: todavía no.** Sobre mundos oscuros las teselas se leen como **bloques negros que faltan** (un fallo de vídeo), lo contrario
de las refs. 13 y 14, que están llenas de imagen, color y luz. Capturas vistas: `int/t028/sheet-v2.png`.
1. **Las teselas llevan imagen, nunca negro.** Cada tesela muestra el mundo saliente desplazado, ampliado o estirado (una columna de
   píxeles arrastrada a lo largo de la tesela). Tope: < 10 % del área en negro puro en cualquier instante.
2. **Que se vea la pieza aunque el mundo sea negro**: canto biselado de 1,5 px al 30 % iluminado desde arriba-izquierda, cara con un
   8–12 % de película fina, y **luz iridiscente HDR 1,5–2,5 escapando por las grietas** (`#8FE3FF → #F2A6C8 → #F6D47A` según el ángulo).
3. **Coreografía: una ola, no un sarpullido.** Un frente que sale del muro de origen y da la vuelta a la sala en 1,4 s; cada tesela gira
   en 0,7 s (`easeInOutCubic`); grandes primero (0,9 m), se subdividen en el frente (0,45 · 0,22 m) y se vuelven a unir detrás. Pico al 45 %.
4. **Relieve**: la tesela se despega (escala 1 → 1,08) y proyecta **sombra suave** (0,1 m, 35 %) sobre la imagen de detrás: se convierte
   en una losa que se levanta del muro, no en una cortinilla 2D.
5. ***Pixel sorting*** en el frente: rayas verticales de 0,3–1,2 m, 0,5 s (refs. 12 y 14).
6. **El hilo conductor** es una bola blanca borrosa pegada a la cartela: compite con el título. Pequeño y nítido (núcleo 6 cm, destello de
   4 puntas), del color del capítulo, y apagado mientras la cartela está en pantalla.
**Conservar:** el ojo que se mueve con la transición, el árbol cuádruple, la costura sin corte, el texto fuera de las teselas.

## 2. Coherencia de la obra entera (para el director)
- **El defecto común de hoy** es «objetos sueltos del mismo tamaño sobre negro» (hexágonos, cubos de alambre, cuadraditos, primitivas).
  La regla 1 : 3 : 9 y la luz de la biblia §3 lo arreglan en todas las piezas a la vez.
- **Un hilo humano**: los cuerpos de puntos de la Pinya deben reaparecer en el Tronc (dentro de la torre) y en el Pom (la enxaneta): es lo
  que hace que cinco universos sean una sola historia.
- **Un solo botón, una sola tipografía, una sola transición**: ya encaminado; falta que el vidrio del botón y el de las teselas de la
  transición sean la misma materia (misma iridiscencia `#8FE3FF → #F2A6C8 → #F6D47A`).
- **Texturas CC0**: 3D-FE no descargó nada porque necesita un sí de Vicente en el chat. El esmalte craquelado y la piedra ganarían mucho
  con mapas de normal y rugosidad reales: conviene pedírselo.

---

# RONDA 2

### 3D-PO — Pom, pulido 2 · 13:20 (visto: `t031/board5.png`)
**Veredicto: sí en el cañón, todavía no en la cima.** La fila 1 (p 0,15, manos quietas: el oro derramándose por las fachadas, tres
grosores de línea, buses con pastillas) ya es una imagen de autor: es la ref. 11 con vida propia. Las filas 3–4 (arriba) son el premio de
la subida que Vicente adora y ahora mismo son lo más flojo: rejilla gris oscura abajo y 55 % de cielo vacío.
1. **La cima necesita su imagen.** (a) La placa de circuito **encendida**: patios de oro `#FFD27A` que parpadean hasta el horizonte (hoy
   apenas se ven), la Diagonal como una traza de oro gruesa (3 px, HDR 2) con pulsos, las manzanas en línea doble al 60 % cerca y al 25 % lejos;
   (b) **el cielo también es circuito**: constelaciones dibujadas como trazas con pastillas (línea 1,5 px al 22 %, estrellas-pastilla al 80 %)
   que continúan el dibujo de la ciudad hacia arriba y rodean la sala — llena el 55 % vacío con la idea de la obra, no con adorno.
2. **Un momento de sala en la subida: atravesar la bruma.** Hacia p 0,55–0,65, una capa de niebla fina con el oro de la ciudad por debajo:
   la sala entera se vuelve velo dorado suave 1,5 s y al salir aparece la placa de circuito entera. Es el golpe de vértigo que falta (y
   después, esa bruma queda abajo, entre nosotros y la ciudad: da la altura).
3. **Capa cercana arriba**: en p 1 no hay nada cerca y la imagen se queda quieta. 6–8 pétalos de oro y esquirlas de vidrio que suben
   con nosotros y derivan (0,1–0,2 m/s), a 0,3–1 m tras el muro.
4. **Jardines: de salpicadura a planta.** Siguen leyéndose como polvo de oro en las repisas. Darles silueta: tallos finos + umbelas
   reconocibles (las copas de la fila 3 ya lo consiguen: llevar esa forma a las repisas del cañón) sobre una masa de hoja oscura con borde.
5. **Techo al oro**: los núcleos de los jardines en flor se queman a blanco en manchas de ~0,5 m. Tope: blanco plano ≤ 15 cm; el resto, oro `#FFD27A`.
6. **Menores**: los bloques lejanos con rejilla uniforme de ventanas («gofres») al 25 % y con menos ventanas; los anillos concéntricos de
   la fila 2 parecen un fallo de lente: más finos (1,5 px, 20 %) o fuera; el mástil de celosía, al 15 %.
**Conservar:** todo lo de la fila 1; la estrella nítida con su hilo; los racimos de vidrio.

### ENT — textos de la espera · 13:20
De acuerdo con la propuesta de ENT: antes de revelar **«Tocad. Jugad con la sala.»**, revelado **«Sostened el anillo para empezar»**
(Geist 400, una línea, base a 2,05 m). Y en la bajada, **«Acompañadlo / piso a piso»** (coincide con la voz).

### 3D-BR — Brasa, pasada de pulido · 13:25 (visto: `brasa3d/t029/p4_tap_p1.png`, `p4_board.png`)
**Veredicto: sí, esto ya es 3D pro.** El muro de cerca (`p4_tap_p1`) es la mejor imagen de la obra hoy: metal líquido con bandas plata
y naranja, figuras de fuego reflejadas, ondas de las manos, brasas de cerámica agrietada. Tres cosas la separan de la ref. 8:
1. **Las columnas no son cromo.** Hay dos familias y ninguna refleja: los monolitos ondulados se leen como pizarra mate y los **conos
   beige** como estacas de madera (primitivas). Una sola familia: **gotas de mercurio** — perfil orgánico con panza y cuello (torno con 2–3
   bultos, sin punta de cono), `metalness 1`, `roughness 0.05–0.08`, que **reflejen el fuego** como vetas verticales naranja vivo y el cielo
   plata arriba. Si reflejar la escena es caro, que al menos reflejen el entorno y una luz por figura de fuego cercana.
2. **El suelo lejos del fuego hace un «rombo» regular.** En la tira (`p4_board`) las bandas beige forman un zigzag periódico que se repite
   por los cuatro muros y brilla igual donde no hay fuego. (a) Bajar a la mitad la franja cálida del entorno lejos de las llamas: allí el
   metal debe ser casi negro con filos plata `#9FB4D8`; el naranja, sólo en un radio de 3–4 m de cada fuego; (b) deformar el oleaje con ruido
   a dos escalas para que ninguna cresta se repita.
3. **La tesela que arde no es un farolillo.** Las piezas encendidas son caras naranjas planas con borde blanco (izquierda de `p4_tap_p1`).
   La buena es la de la derecha: costra oscura con grietas de luz. Todas así: cara `#2A0C08`, grietas `#FF5A1F` HDR 3, blanco sólo en el filo.
4. **Menor**: las brasas colgadas rojas, de lejos, siguen siendo polígonos rojos: darles canto visible (grosor 2–3 cm) y la misma costra.
**Conservar:** el metal con sus dos temperaturas, las ondas de mano, las figuras de fuego, los charcos de lava, la bruma roja lejana.

### 3D-FE — Tronc, pasada ARTE · 13:25 (visto: `tronc/n_board.png`, `n_f5.png`, `n_f9.png`, `n_obra.png`)
**Veredicto: mejor idea, todavía no pro — es la pieza más floja de la obra y necesita una decisión de estilo, no más objetos.**
La asimetría, los contrapesos, el panot, la gente de puntos y los cuatro muros ocupados están bien. Pero cada objeto intenta ser realista
con una textura de ruido borrosa (la losa color arena, las bolas de corcho, las losas marrones, las macetas de dibujos animados) y el
conjunto se lee como «assets de juego sin terminar». En la ref. 9 lo arquitectónico **no tiene textura: es yeso blanco** (escaleras,
puerta, balaustrada, trompetas) y por eso parece una obra de arte y no un videojuego.
1. **Decisión de estilo: «maqueta blanca».** Toda la arquitectura (fachada con persianas, tribuna, balcón, escalera de caracol, cuerpo de
   las chimeneas, banco, rosetón de piedra) en **yeso mate hueso `#F1ECE2`, `roughness 0.9`, sin ruido**, como una maqueta de arquitecto.
   El color queda sólo en: terracota y ladrillo (15 %), trencadís esmaltado (10 %, con su brillo), cromo espejo (10 %), paneles de neón
   (5 %). **Fuera**: la losa arena, las losas marrones, las esferas de corcho (→ cromo o roca muy oscura), cualquier ruido borroso.
2. **Contraste de luz ×2.** Ahora todo queda en medios tonos turbios. Principal cenital al doble, lado en sombra **casi negro**, contraluz
   turquesa visible como un filo de 1,5–2 px en cada silueta, sombra de contacto más oscura. Con yeso blanco esa luz dibuja sola.
3. **La cima es lo más pobre y debería ser lo más rico.** En el piso 9 (`n_f9`) la torre vuelve a ser un palo de 0,3 m (bolas apiladas =
   pieza de ajedrez) y el 60 % del muro es negro. Los tres últimos pisos, tan anchos como los de abajo (2–3 m): las dos chimeneas de Gaudí
   a los lados de un rosetón de vidrio encendido desde dentro, la gente de puntos en corro, y la enxaneta como punto de luz con hilo fino.
4. **Las flores**: las macetas con pétalos de colores son de otro tono (infantil). Plantas de **puntos de luz** como los jardines del Pom
   (umbelas crema `#FFF2D0` y oro sobre hoja casi negra): además une Tronc con Pom.
5. **Torres lejanas (P2/P3)**: son tótems de cubos de colores. Sólo **silueta**: el mismo perfil asimétrico, negro, con filo turquesa de
   contraluz y humo detrás; sin color ni detalle. A 25–40 m deben medir 1,5–2,5 m en el muro.
6. **Texto sobre la torre** (en la obra la instrucción cae encima de la fachada clara y de las fibras): GUI sube la placa oscura al 60 %
   en Tronc, y la torre baja ×0,5 su brillo dentro de la caja del texto (centro del muro, 1,75–2,2 m). Las fibras, sólo bajo cada piso.
**Texturas CC0**: 3D-FE no descarga sin un sí directo de Vicente; con la «maqueta blanca» hacen falta muchas menos (bastarían 2 mapas de
normal: esmalte craquelado y ladrillo). Si el director las baja a `parts/tronc3d/`, 3D-FE las conecta.
**Conservar:** asimetría y contrapesos, esfera de cromo con anillo, panot, gente de puntos, haces de fibras, humo de color, la física.

### 3D-PI — Pinya, pulido · 13:28 (visto: `pinya3d/a2/q_t4500_p1.png`, `a2/obra/q0.png`)
**Veredicto: sí — identitaria y pro en el muro que se sostiene.** `q_t4500_p1` (el nudo coral donde está la mano, las fibras de hombro a
hombro, la rejilla roja bajo los pies, la espiral arriba) es la ref. 10 hecha multitud. Lo que falta está en los muros en reposo y en el detalle:
1. **Los muros sin manos se apagan demasiado.** En la obra (`obra/q0`) P2 y P3 quedan en un teal casi negro: tres cuartas partes de la sala
   sin imagen. La primera fila en calma, al 55–60 % de la luminancia del coral encendido (turquesa `#2ED3C6` pleno en hombros y cabezas),
   y una **respiración que recorre la multitud** (onda lenta de brillo y de 3–4 cm de altura, 12 s por vuelta a la sala). La espiral sólo se
   ve entre P4 y P1: o una segunda forma en el lado opuesto, o convertirla en un **brazo de galaxia que rodea la sala** (cuando la sala gira,
   se la ve pasar por los cuatro muros).
2. **Fibras = cuerdas, no pelos.** Desde 3,5 m las de agarre son un hilo. Hacerlas **haces de 5–7 hebras retorcidas de 12–20 mm**, con
   comba (catenaria) en reposo y rectas al tensarse; las hebras sueltas actuales quedan como segundo nivel.
3. **Techos de blanco.** El núcleo de la espiral (≈ 1,5 m de blanco plano en `q_t4500_p1`) y el punto de la mano se queman. La espiral
   nunca más brillante que el nudo de la mano; núcleo en hueso `#F0D9C4`, no blanco; blanco plano ≤ 15 cm.
4. **Posturas**: todos los cuerpos repiten «brazos arriba». Tres o cuatro posturas de pinya de verdad (manos en los hombros del de
   delante, cabeza agachada, brazos extendidos hacia el centro) y alturas ±8 %. Los 8–12 vecinos de una mano **se vuelven hacia ella**.
5. **Teselas cercanas**: los cuadrados azul y verde planos se leen como tarjetas. Forma irregular con bisel y reflejo (biblia §1) o fuera.
**Conservar:** el nudo coral y el haz de la mano, la rejilla que se enciende bajo los pies, la bruma teal en profundidad, el desgranado al soltar.

### GUI — tercera vuelta · 13:32 (visto: `caps-gui/c3-pinya-button-line.png`, `c3-tronc-one-line.png`)
**Veredicto: tipografía sí, cerrada** (sin halo, una pieza centrada, la etiqueta en versalitas: se lee y es elegante). **Botón: casi.**
1. **El disco es una placa lila lechosa**, no vidrio oscuro: sobre el Tronc compite con la terracota y tapa la torre. Disco `#0E1016` al
   55 % (oscurece lo de detrás en vez de aclararlo), con un velo de reflejo frío sólo en el tercio superior. El anillo de vidrio, con más
   cuerpo: sección 3 cm y el reflejo nítido a HDR 2 para que desde 3,5 m se vea un aro de cristal y no una línea.
2. **La mano**: el contorno actual es un guante de dedos gordos. Propuesta de identidad: **una mano de trencadís** — palma + cinco dedos
   = seis teselas de vidrio con junta fina, en hueso al 85 %; al acercar la mano real, las seis teselas se encienden de dentro afuera
   (120 ms). Es el icono de la obra (puede ir también en el acta y en el cartel).
3. **Placa bajo el texto en Tronc al 60 %** (acordado con 3D-FE): «LOS DOS LADOS · QUARTS · PISO 4» se pierde sobre el trencadís.
4. **Teselas de progreso**: bien. Que las que faltan se vean como huecos tenues (10 %) para que el aro siempre esté completo como forma.
**Conservar:** todo lo tipográfico tal cual; el latido de 2,4 s; el estallido al completar.

### INT — transición 2.ª pasada + plaza de la intro · 13:32 (visto: `int/t034/v4-tear.png`, `sheet-v5.png`, `light2-crop.png`)
**Veredicto: sí sobre mundos con luz** (`v4-tear`, la plaza rasgándose en losas con su propia imagen: ya es la familia de las refs. 13/14),
**todavía no sobre mundos oscuros** (`sheet-v5`: brasa→pinya y pom→crown siguen siendo recortes negros escalonados sobre negro).
1. **La losa tiene que existir sin imagen: es un espejo que gira.** Cada losa, al voltear, **refleja `room.envMap`** con Fresnel y lanza un
   **destello especular** que la cruza (lóbulo estrecho, HDR 2–3, 0,25 s) + película fina `#8FE3FF → #F2A6C8 → #F6D47A` en el canto,
   *siempre*, no «sólo donde hay luz». Así en negro se ve una ola de espejos girando — trencadís de cromo — en vez de huecos.
2. **La luz de la grieta, siempre**: línea de 1,5–2 px a HDR 1,5–2,5 entre losas en vuelo, también sobre negro (es lo único que dibuja la
   teselación cuando los dos mundos son oscuros).
3. **El hilo sigue siendo un rombo blanco borroso junto a cada cartela** (cuatro focos que compiten con «Brasa» y «Pinya»). Núcleo de 6 cm,
   nítido, color del capítulo, y **apagado mientras la cartela está en pantalla**; o fuera: la ola ya guía la mirada.
4. **Silueta de la ola**: ahora es una pirámide escalonada de bloques iguales. Frente más orgánico: borde con 3 tamaños mezclados y
   algunas losas adelantadas 0,5–1 m al frente (como salpicaduras), no una escalera.
**Plaza de la intro** (`light2-crop`): **sí, pro** — es la escena mejor iluminada de la obra. Para que cumpla el guion de color (azul noche
+ ámbar de farol) le falta el azul: ahora todo es sodio marrón. (a) Fachadas fuera de los charcos de farol, hacia azul `#1B2A52` (luz de
cielo fría ×2, o `moonKey` 4); charcos de ámbar de 4–5 m de radio y, entre ellos, noche azul: el contraste cálido/frío es lo que la hace
cine. (b) El polvo parece nieve: la mitad de densidad, más fino, visible sólo dentro de los conos de luz de las farolas.
**Conservar:** el entorno capturado de la plaza, el suelo mojado, el rasgado en losas de imagen, el ojo que se mueve.

### 3D-FE — Tronc «maqueta blanca» · 13:30 (visto: `tronc/q_board.png`, `q_obra.png`)
**Veredicto: sí en el estudio — por fin tiene estilo; todavía no en la obra (exposición rota).** En `q_board` la esfera de cromo con su
anillo, los volúmenes de yeso con filo turquesa, el rosetón-rueda con vidrio encendido y la copa de gente de puntos ya son una pieza
de autor (ref. 9). En `q_obra` (piso 0, con manos) la base son **cubos blancos quemados** a la altura de las manos y el texto no se lee encima.
1. **Exposición del yeso.** El blanco × luz doble × brillo de mano se va a 100 %. Topes: albedo del yeso 0,72; la cara iluminada cae al
   70–80 % de pantalla, **nunca blanco plano**; el brillo de la mano y el destello de piso fijado **tiñen** (ámbar `#FFD2A0`) en vez de
   sumar, con techo 1,0 HDR sobre el yeso.
2. **La torre es oscura abajo y clara arriba.** La base (lo que cae en la banda de manos y botones, 0,5–1,7 m) en **piedra oscura**
   `#2A2622` con el panot encima, y la luminancia sube piso a piso hasta la copa. Deja limpia la banda de la guía, da peso a la base y
   hace que subir sea ir hacia la luz. Además la base son cubos lisos: bloques irregulares de cantera, con canto roto.
3. **Torres lejanas (P2/P3)**: siguen siendo tiras finas con cubos blancos flotando. Silueta negra con filo turquesa, perfil asimétrico
   como las de cerca, 1,5–2,5 m en el muro, un punto de luz arriba. Sin cubos blancos sueltos (a esa distancia son ruido).
4. **Humo**: bien de color; en la obra las manchas turquesa y naranja son muy grandes y compiten con la torre: 60 % de la opacidad actual
   y sólo detrás de cada torre.
**Conservar:** todo `q_board` tal cual (esfera, rosetón-rueda, copa de puntos, filos turquesa). Es el camino.

### ENT-F — entrada `umbral3d` nueva (muro de trencadís con rosetones) · 13:33 (visto en curso: `scratchpad/entf/b6.png`, `b6-L.png`, `b8-L.png`)
**Veredicto: sí — identitaria desde el primer vistazo; ésta es la imagen de la obra.** Un muro de trencadís en relieve con rosetones de
1–1,5 m que rodea la sala, piezas que se desprenden, hilos, suelo espejo; en reposo casi monocromo modelado por dos luces (`b8`), y a
todo color tras el juego (`b6`). Es Gaudí y es digital. Notas para rematarla (aún sin notas del constructor; las ajusto cuando entregue):
1. **El hueco negro del centro de cada muro, convertirlo en EL UMBRAL.** Ahora es un rectángulo oscuro de borde duro alrededor del botón
   (parece un agujero de render). Que sea una **puerta en arco** en el muro de mosaico (≈ 1,1 m de ancho × 2,3 m de alto, arco parabólico
   de Gaudí, jamba de teselas en canto, dorada por dentro), por la que se ve **lejos**: noche azul `#0B1430` y la línea de brasa. El anillo
   flota dentro de la puerta. Al empezar, **la sala atraviesa la puerta** (el ojo avanza 2–3 m, 0,35 m/s) y la teselación ocurre al cruzar:
   la entrada pasa a ser, literalmente, un umbral, y es el primer movimiento de sala.
2. **Color = recompensa, con familias.** Reposo como en `b8` pero más limpio: hueso `#F1ECE2` y grafito `#1A1B20` (ahora tira a malva
   sucio), 1 de cada 6 teselas de cromo espejo. Al tocar, el color **se propaga por el rosetón desde la mano** (anillo a anillo, 0,5 m/s) y
   se queda. Cada rosetón, **una familia** (no arcoíris): brasa (`#E0301A` `#FF6A1F`), pinya (`#2ED3C6` `#FF6F59`), tronc (`#C4623A`
   `#2146B0` `#E3A32B`), pom (`#EEF2FF` `#FFD27A`), amanecer (`#F7B7C6` `#B9A3E8` `#8FE0D2`), siempre con un 30 % de hueso. En `b6` hay
   demasiados malvas y marrones mezclados: con familias limpias el muro encendido será mucho más rico.
3. **El faro.** Las dos luces que modelan el relieve (ámbar y blanca) son lo que lo hace 3D: que **viajen** despacio alrededor de la sala
   (una vuelta cada 24–30 s, en sentidos contrarios) y que cada tesela tenga 2–4° de inclinación propia y esmalte con brillo (clearcoat):
   el mosaico centellea en ola al paso de la luz. Sus núcleos, sin quemar (bola de vidrio de 12 cm, no un destello blanco de 40 cm).
4. **Detrás de los huecos, mundo.** Donde faltan teselas se ve negro plano. Capa lejana: noche azul con la línea de brasa y, muy tenue,
   un segundo muro de mosaico a 20–30 m; los huecos pasan a ser ventanas y la sala gana fondo.
5. **El anillo del botón**: los segmentos rojo/azul/amarillo/blanco parecen de juguete. Teselas de hueso y oro con un solo acento, las
   mismas del muro (GUI y ENT-F, misma receta). Las teselas que rodean la puerta se atenúan en degradado, sin corte.
6. **Lo físico** (que no se pierda con el cambio de concepto): tocar un rosetón lo **desprende en espiral** — las teselas saltan del muro,
   caen con peso, rebotan y resbalan por el suelo espejo, y vuelven a su sitio ya con color al cabo de 3–4 s; las piezas colgadas son
   péndulos que chocan entre sí; con dos manos en el mismo rosetón, sale entero y gira como una rueda.
**Conservar:** el relieve del mosaico, los rosetones, el borde superior que se deshace en teselas sueltas, los hilos, el suelo espejo, el
reposo monocromo.

### 3D-PO — Pom, ronda 2 aplicada · 13:36 (visto: `t031/board7.png`)
**Veredicto: sí.** Cañón, bruma, cima-placa con patios de oro, constelaciones-circuito, plantas con silueta de umbela: ya es un universo
propio de principio a fin. Aprobado para integrar; tres retoques de diez minutos, sin bloquear el paso a la bajada:
1. **La bruma es un lavado sepia plano** (fila 2: marrón uniforme sobre todo el muro). Oro pálido `#FFE9B8`, no marrón; densa por debajo
   del horizonte y transparente hacia arriba (degradado vertical), con 3–4 haces verticales suaves; pico de 1,5 s y fuera.
2. **Constelaciones: jerarquía 1 : 3 : 9.** Ahora son ~25 segmentos iguales por muro repartidos por igual (la «lluvia uniforme» otra
   vez). 2–3 constelaciones grandes por muro (1,5–3 m, 5–9 nodos, algún quiebro a 45°), 6–8 pequeñas, y zonas de cielo vacío.
3. **Bloques «gofre»** (fila 1, las cajas con rejilla de ventanas): siguen al 45–50 %; al 25 %.
**Conservar:** todo lo demás. Pom queda como referencia de «línea + oro» para la obra.

### GUI — cuarta vuelta · 13:38 (visto: `caps-gui/c4-button-rest-held.png`, `audit-readability.png`)
**Veredicto: sí — tipografía y botón aprobados.** El anillo ya es un objeto y la mano de trencadís es un icono propio. Dos afinados, sin prisa:
1. **La mano se lee un poco «robot»** (cuatro rectángulos + hexágono con un cuadrado blanco en el centro, que parece un botón de stop).
   Dedos con la punta redondeada y abiertos en abanico (8–12° entre ellos, el corazón más largo), pulgar más bajo a 45°, palma en pentágono
   irregular; el «corazón» encendido, un punto redondo suave, no un cuadrado.
2. **Auditoría de legibilidad**: de acuerdo con tu lectura. Tronc y Bajada no se arreglan con más placa: son los fondos los que están
   quemados (notas a 3D-FE y a `baixada3d`: columna del botón ±0,9 m × 0,9–1,6 m y caja del texto 1,75–2,2 m **sin nada claro detrás**).
   Deja la placa al 60 %; no subas al 75 % (empezaría a parecer una etiqueta).
**Regla para todos (va a la biblia §4):** en el centro de cada muro hay dos zonas tranquilas — la del texto (±1,6 m × 1,75–2,2 m) y la del
botón (±0,9 m × 0,9–1,6 m): ahí, ninguna superficie por encima del 35 % de luminancia.

### 3D-PO — `baixada3d` v1 (la bajada al amanecer) · 13:38 (visto: `t035/b4.png`)
**Veredicto: todavía no — hoy es *vaporwave*.** Suelo de rejilla lila + degradado pastel + cajas de alambre + polígonos planos translúcidos
+ una flor de dibujo: es el cliché de los 80, no la ref. 12 (vidrio de verdad, plantas, nubes rosas, veladura de *pixel sorting*).
1. **Fuera la rejilla del suelo.** Bajamos a la plaza al amanecer: suelo de **agua quieta / losa mojada** que refleja el cielo (espejo,
   `roughness 0.08`), con niebla baja rosa de 0,5 m. Es el mismo suelo espejo de la entrada y de la brasa, ahora con luz: cierra el arco.
2. **Vidrio de verdad.** Las esquirlas son polígonos de color plano con alfa. Vidrio casi incoloro que toma el color del cielo: reflejo del
   horizonte claro con Fresnel fuerte, **canto brillante** (el `fwidth` del Pom), película fina leve; sólo 1 de cada 5 teñida (rosa
   `#F7B7C6`, aguamarina `#8FE0D2`, melocotón `#FFD0A8`). Con grosor (1–2 cm) y destello al girar hacia el sol.
3. **Un cielo con algo dentro.** Hoy es un degradado malva. Sol justo bajo el horizonte (resplandor `#FFF6E0` en un muro: la sala tiene un
   **este**), 3–4 bandas de nubes iluminadas desde abajo (rosa/melocotón, ref. 12) y, desde el horizonte hacia arriba, **vetas verticales de
   *pixel sorting*** (1–3 m, 20 %): la veladura digital de la ref. 12. Cielo arriba `#2A2140`, horizonte `#F3B9B0`.
4. **La torre es el castell del Tronc hecho vidrio**, no un cilindro de confeti por bandas: la misma silueta asimétrica, piso a piso; cada
   piso que baja **se deshace en lluvia de vidrio** (cae lento, 3 m/s² aquí, girando y destellando).
5. **Las flores, de vidrio**: donde la mano recoge la lluvia, las esquirlas se ordenan en una flor (6–9 pétalos = 6–9 esquirlas en roseta,
   tallo de línea fina) que se abre en 1,2 s. Nada de margarita rosa plana. Es el trencadís volviendo a juntarse: la última imagen de la obra.
6. **Los bloques de alambre**, al 20 % y disueltos en la bruma; y la zona del botón y del texto, sin piezas claras (regla de arriba).
**Conservar:** la paleta (rosa, lila, aguamarina, melocotón), el cielo claro (única escena sin negro), la idea de lluvia que se recoge.

### 3D-BR — Brasa, columnas (seguimiento) · 13:38 (visto en `rndf/q-sheet.png` y en la auditoría de GUI)
Las «gotas de mercurio» han salido como **peones de ajedrez / bolos con punta**, y siguen oscuras (alguna es vidrio marrón). Dos cosas:
perfil sin punta y sin simetría de torno (cabeza redonda, cuello torcido 5–10°, cada una distinta, como una gota subiendo), y **espejo
de verdad**: hoy no reflejan ni el fuego ni el cielo plata. Si no se puede a tiempo, mejor 5 por muro bien hechas que 14 peones.

### 3D-BR — `festa3d` v1 (coronación + ressonància de cromo y vidrio) · 13:42 (visto: `brasa3d/t033/f1_p1.png`, `sweep_board.png`)
**Veredicto: todavía no — sigue siendo un gráfico 2D sobre el muro.** Es la escena que da nombre a la obra y la más libre, y hoy son curvas
de nivel doradas sobre un espejo oscuro turbio, con láminas beige planas y una retícula de rombos de colores encima (parece malla de
depuración). El relieve de cromo no se lee, y a resonancia 1 la figura es un **papel pintado** de celdas de 30 cm repetidas (filas 2 y 5).
Lo mejor: la coronación a los 15 s (fila 4: la red de cáusticas de oro llenando la sala).
1. **Que la placa sea un objeto con fondo: una membrana de cromo alrededor de la sala.** «Los muros = la placa» la aplasta contra el muro.
   Ponerla **1,2–1,5 m detrás del muro**, vertical, como la piel de un tambor que nos rodea, con desplazamiento real hacia el público
   (ondas de 0,8–2 m de longitud y **0,2–0,4 m de amplitud**). Es el suelo de la Brasa puesto de pie: mismo metal, misma receta (cielo de
   estudio oro arriba, lila `#B9A3FF` de contraluz abajo: crestas de oro, valles lila oscuro). El relieve se lee por cómo resbalan las bandas
   de luz, no por líneas dibujadas.
2. **Las figuras las dibuja arena, no curvas.** 200–400 mil granos de oro (puntos HDR, 3–6 mm) que **saltan** donde la membrana vibra y
   se **amontonan en las líneas nodales** (la placa de Chladni de verdad): con masa, con paralaje, con brillo propio. Las curvas de nivel
   bajan al 20–30 % o desaparecen. Fuera la retícula de rombos de colores.
3. **Figuras grandes, no papel pintado.** Modos de placa mezclados (2–3 modos superpuestos que derivan despacio, distintos en cada muro):
   **una figura-mandala de 1,5–3 m centrada en cada muro** y figuras menores alrededor (1 : 3 : 9). Cuanto más a la vez toca el grupo, más
   se ordena y más simétrica se vuelve; sin sincronía, la arena queda dispersa. Esa es la regla del título hecha visible.
4. **La interacción física: canicas de mercurio sobre el tambor.** En vez de 140 láminas beige, **3–5 esferas de cromo por muro**
   (0,25–0,6 m, la esfera del Tronc) más 10–15 pequeñas, posadas en la membrana. La mano las lanza; vuelven, **rebotan** (0,6) y cada bote
   abre un anillo en el cromo y levanta arena. Dos manos cerca: las esferas ruedan de una a otra. Legible desde 3,5 m, y dan ganas de repetir.
   El vidrio, grueso y con canto (biblia §1) o fuera.
5. **Al máximo**: bandas de *pixel sorting* en el tercio superior (ARTE-2) y la sala flotando; hoy el máximo sólo es «más de lo mismo».
6. **Las coronas** (fila 3) son iconos de interfaz: o las dibuja GUI con su trazo (línea fina, hueso), o fuera — ya está la cartela.
**Conservar:** la coronación de cáusticas de oro (fila 4), el hoyuelo de la palma como lente, el anillo que suena con cada caída, la sala que flota.

### ENT-F — entrada con los umbrales · 13:45 (visto: `entf/d5-L.png`)
**Veredicto: sí — es la imagen de la obra y ya tiene puerta.** Los arcos parabólicos abiertos a la noche azul con la línea de brasa, el
anillo dentro, las familias de color por rosetón: todo funciona y es de Barcelona sin ser postal. Para el nivel «pro»:
1. **Encendido, el mosaico se aplana.** En reposo (`b8`) el relieve con las dos luces era escultura; con color (`d5`) se lee como
   ilustración vectorial: color plano + contorno negro grueso. (a) La **junta**, cemento `#3A3632` y de 8–10 mm (hoy es negra y de 3–4 cm);
   (b) las teselas de color conservan el **esmalte**: brillo especular del faro en cada una, 2–4° de inclinación propia, canto de terracota
   visible; (c) el color sube la saturación pero **no apaga la luz**: la misma tesela debe seguir teniendo cara clara y cara en sombra.
2. **El arco es un tubo de cromo** (un aro de croquet) con dos discos marrones en los pies. Que sea **el canto del muro**: una jamba de
   25–30 cm de fondo revestida de teselas doradas en canto (se ve el grosor del muro de mosaico), con un filo de luz de brasa por dentro.
   Sin discos. El cromo, mejor en 1 de cada 6 teselas del muro que en el marco.
3. **Zona tranquila**: el interior del arco es perfecto para el botón. El texto («Tocad. Jugad con la sala.») cae sobre el mosaico
   encendido a 2 m: bajar ×0,5 las teselas dentro de la caja del texto, o subir la clave del arco hasta 2,3 m y poner el texto en el cielo del arco.
4. **Quiero ver lo físico**: una captura a +0,3 s y +1 s de tocar un rosetón (teselas en el aire, rebote en el suelo espejo). Si hoy sólo
   cambian de color, falta la mitad de lo que pidió Vicente («tocar cosas y que caigan»).
**Conservar:** arcos, noche azul con línea de brasa, familias de color, anillo de hueso y oro, borde superior deshecho, suelo espejo.

### RND-F — transición por teselas (T-037) · 13:48 (visto: `rndf/nat2.png`, brasa→pinya en la obra)
**Veredicto: sí — ya es el lenguaje de las refs. 13/14, también sobre negro.** Losas con filo iridiscente, vetas de *pixel sorting* y
fragmentos del mundo entrante dentro: por primera vez la transición es una imagen y no un fallo. Afinado:
1. **Más cara, menos marco.** Muchas losas son sólo un contorno fino vacío (se leen como ventanas de interfaz anidadas). Que al menos la
   mitad lleven **cara**: reflejo de `room.envMap` o imagen estirada, con el destello especular al girar. El contorno solo, para las pequeñas.
2. **El color del filo cuenta la historia**: del acento del capítulo que se va al del que llega (brasa `#FF6A1F` → turquesa `#2ED3C6`,
   etc.) a lo largo de la ola, con la iridiscencia pastel sólo como brillo. Hoy todas las transiciones serían rosa-cian-oro: iguales.
3. **Texto y botón durante la ola**: la instrucción entrante («Buscad un círculo…») ya está encima mientras las losas pasan por detrás:
   que el texto del capítulo nuevo entre **cuando la ola ha pasado por su muro** (+0,3 s), no antes.
**Conservar:** todo lo demás; no tocar la duración.

### 3D-FE — Tronc collage · 13:48 (visto: `trof/c_board.png`, `c_f8.png`)
**Veredicto: casi — ha encontrado el lenguaje (ref. 9: paneles rectangulares de textura + objetos + marcos de línea fina).** Los paneles
de cromo líquido, de *pixel sorting* y de trencadís con marcos blancos son collage de autor. Tres cosas para cerrarla:
1. **Está subexpuesta**: ahora el pico ronda el 50 % y todo es penumbra. Un **protagonista de luz por piso**: un panel de neón encendido
   (lima `#E9F27A` o cian `#8FD8FF`, HDR 2) que ilumine a sus vecinos, o el brillo de la esfera de cromo; y la luminancia sube hacia la
   copa (regla «oscura abajo, clara arriba»). Fuera de las dos zonas tranquilas, pico al 80 %.
2. **Jerarquía de paneles 1 : 3 : 9**: hoy son ~12 paneles de ~0,5 m todos parecidos. Por piso, **uno grande de 1,2–1,6 m** (cromo
   líquido *en movimiento*, no textura fija), tres medianos y recortes pequeños. Algún panel que sobresalga mucho del eje (voladizo).
3. **Las chimeneas de juguete** (torrecitas con tapa roja): al doble de tamaño y con trencadís legible, o fuera.
**Conservar:** paneles con marco, cromo líquido, gente de puntos, tribuna de vidrio, anillos, las líneas finas de construcción.

---

# RONDA 3 — 13:55

### ENT-F — entrada entregada · (visto: `umbral3d/shots/f-04a-touch-0.35s.png`, `f-06-obra-wait-6people.png`)
**Veredicto: sí — aprobada. Pro e identitaria; es lo mejor de la obra.** El muro en relieve hueso/grafito modelado por el faro, las
teselas que saltan hacia el público y quedan en el suelo espejo, el color que florece por familias, los umbrales a la noche azul.
Retoques (ninguno bloquea):
1. **La puerta, a escala humana, y el texto como inscripción.** La clave está a 2,6 m y la frase cruza la jamba (media sobre mosaico, media
   sobre el hueco). Clave a **1,95 m** (una puerta de verdad: más umbral, más íntimo) y la frase centrada **encima**, a 2,12 m, sobre las
   teselas atenuadas, como la inscripción de un dintel.
2. **La jamba a rayas oro/hueso** recuerda a una carpa. Teselas doradas irregulares en 2–3 tonos (`#F6C65B`, `#C99A3A`, `#FFE9B8`), sin
   alternancia regular.
3. **El faro quema cuando pasa cerca** (P3, derecha de `f-06`: ~1 m de blanco). Atenuación con la distancia acotada: blanco plano ≤ 15 cm.
4. Si sobra tiempo: craquelado CC0 en el esmalte y reflejo de las piezas caídas en el suelo (lo que ya apunta ENT-F).

### TRO-F — Tronc, relevo · (visto: `trof/h_f5_w1.png`)
**Veredicto: sí — ya es una pieza de autor (ref. 9).** Placas de cromo líquido, muro de trencadís que destella, neón de píxeles ordenados,
marcos finos, la esfera en su aro, el balcón: collage con jerarquía y con luz. Retoques:
1. **La esfera del aro, que es el centro, está apagada**: un reflejo caliente de la luz principal en ella (especular HDR 2–3) y el neón
   más cercano reflejado; es el objeto que une Tronc con la festa.
2. **Despegar el borde del negro**: por la izquierda y por abajo el collage se funde con el fondo. Velo de humo detrás (teal `#1C5E66`
   abajo, cálido `#B8562C` a media altura, 12–15 %) sólo en la silueta de la torre.
3. **Profundidad entre placas**: que cada placa esté a 0,5–1,5 m de la siguiente en fondo; la subida de la sala tiene que **deslizarlas
   unas sobre otras** (paralaje). Si hoy están casi coplanarias, la subida no lucirá.
**Conservar:** todo. No añadir más objetos.

### 3D-PI — Pinya, ronda 2 aplicada · (visto: `pinya3d/a2/L_closed_s.png`)
**Veredicto: sí — aprobada.** El brazo de galaxia trenzado alrededor de la sala, la respiración, las cuerdas que se tensan en coral: los
cuatro muros tienen imagen. Único retoque: las teselas del suelo (cuadrados pastel) siguen pareciendo papelitos; menos (4–5 por muro) y en
cromo oscuro. Libre para `fall3d`.

### 3D-PO — `baixada3d` v2 · (visto: `t035/b7.png`)
**Veredicto: todavía no — dejó de ser vaporwave pero ahora es turbia.** Malva-marrón de bajo contraste, vidrio que es un contorno pálido,
manchas marrón oscuro en el horizonte. Tiene que ser **la escena más luminosa y limpia de la obra**: el amanecer.
1. **Cielo limpio y con luz.** Degradado nítido: `#2A2140` arriba → lila `#B9A3E8` → melocotón `#F3B9B0` en el horizonte → resplandor
   `#FFF6E0` en el muro del este. Las nubes, **más claras que el cielo que tienen detrás** en su borde inferior (rosa/melocotón, iluminadas
   desde abajo); hoy son borrones marrón oscuro que ensucian. Luminancia media del muro del este ≥ 55 %; del opuesto, 25–30 %.
2. **El vidrio se reconoce porque dobla el horizonte.** Cada esquirla muestra el cielo de detrás **desplazado** (la línea del horizonte se
   quiebra dentro de cada pieza), con canto brillante y un destello HDR cuando mira al este. Hoy sólo hay contorno.
3. **El jardín final.** La flor de línea es un icono de 0,3 m. Flores de 0,4–0,6 m hechas con 6–9 esquirlas reales (con brillo), que **se
   quedan**: al final de la bajada, toda la banda de las manos (0,9–1,6 m) alrededor de la sala es un jardín de vidrio al amanecer. Ésa es
   la última imagen antes del acta.
4. **Los bloques translúcidos rosa** son cajas de relleno: fuera. En la obra ya está la plaza de la intro (INT): que el fondo sea **la
   plaza a contraluz en la bruma del amanecer** — volvemos a donde empezamos, ahora con luz.
**Conservar:** el sol en un muro (la sala tiene este), el suelo espejo, la paleta.

### FES-F — `festa3d` r2 (lo que deja 3D-BR), rumbo para el relevo · 14:00 (visto: `brasa3d/t033/n_board.png`)
**Veredicto: ya es 3D (membrana de cromo con relieve, cuentas de mercurio, mandala de arena) — todavía no es la fiesta.** Se ha vuelto
plata-negro-beige con reflejos de «caja de luz de estudio fotográfico»; el oro, que es el color del capítulo, sólo aparece en la
coronación (fila 5, que sigue siendo lo mejor). Y el mandala es una medalla de 2 m a un lado, no la sala resonando.
1. **Devolver el oro: el cromo refleja una verbena, no un plató.** Cambiar el entorno propio: en lugar de paneles blancos verticales,
   **guirnaldas de bombillas** (dos o tres hilos de luces cálidas `#FFD9A0` que rodean la sala a 2,5–3,2 m, como una fiesta mayor) + un cielo
   oro pálido `#F6C65B` al 15 % arriba y lila `#B9A3FF` abajo. Sobre el metal líquido las bombillas se estiran en rosarios de luz que
   bailan con cada onda: es identidad (la plaza en fiestas) y es lo que mejor luce en cromo. Reposo: cromo oscuro con esos rosarios; al
   resonar, el oro inunda (como la fila 5).
2. **El mandala es la sala.** Hoy: un disco de Ø 2,1 m desplazado del centro, igual en los cuatro muros. Que **crezca con el orden del
   grupo**: de Ø 1 m (una mano) a 3 m, y al máximo los cuatro se **unen en un friso continuo** de figuras de Chladni alrededor de la sala
   (la figura da la vuelta: ésa es la resonancia). Arena de oro HDR, no gris. Cada muro, un modo distinto (4, 6, 8, 12 pétalos).
3. **Jerarquía de las esferas**: las cuentas pequeñas casi no se ven y las grandes no destacan. Por muro, **una de Ø 0,6 m** (la esfera
   del Tronc, con su aro de oro si se puede), dos de 0,3 y diez cuentas; reflejan las guirnaldas. Al lanzarlas, estela de arena.
4. **Zonas tranquilas** ya previstas (`quiet`): comprobar que el mandala no pasa por la caja del texto.
**Conservar:** la membrana a 1,35 m, el relieve, el anillo que abre cada bote, la coronación de cáusticas de oro, la sala que flota.

---

# ARTE-O (Opus), desde 14:30
Relevo de ARTE (en pausa). Misma biblia, misma voz, mismos topes. Juzgo con la prueba de los 3 segundos (masa · luz · materia).

## RONDA 4 — 14:30

### TRO-F — Tronc · (visto: `trof/m1_before_after.png`, `y_board.png`, `j_board.png`, `z_obra_w.png`)
**Veredicto: identitaria sí; pro todavía no — es una tira vertical de 1,3 m en un muro de 7 m.** El «después» de `m1` es mucho mejor que el
«antes» (adiós cubos de juego) y `j_board` izquierda —rosetón-rueda encendido, trencadís cobalto, cromo líquido— es la mejor imagen del Tronc.
Pero el collage ocupa ~20 % del ancho del muro y el resto es negro: no hay masa.
1. **Ancho y voladizo.** Silueta de 2,4–3 m en el muro: por piso, un panel grande que **sale 0,8–1,2 m del eje** hacia un lado y un contrapeso
   (esfera, tribuna) al otro, alternando piso a piso. Velo de humo (teal `#1C5E66` abajo, `#B8562C` a media altura, 12–15 %) que dibuje la
   silueta y la separe del negro. Más ancho, no más objetos.
2. **Zonas tranquilas en la obra** (`z_obra_w`): la esfera con su aro cae **exactamente detrás de «Mantened la torre recta»** y los dos botones
   flotan sobre el collage más brillante. Dentro de la caja del texto (±1,6 m × 1,75–2,2 m) y de la columna del botón (±0,9 m × 0,9–1,6 m):
   piezas ×0,5 de brillo y nada por encima del 35 %; si hace falta, el piso de la esfera sube por encima de 2,2 m.
3. **Torres lejanas y chimeneas.** Las columnas negras con discos turquesa y bolas (`j_board` derecha, `y_board`) se leen como pilas de
   altavoces de depuración: fuera los discos; silueta asimétrica negra con filo turquesa y un punto de luz arriba (ronda 2, punto 5). Las
   chimeneas de sombrero lila (`j_board`) son setas de dibujo animado: trencadís con giro helicoidal, terracota y esmalte, o fuera.
**Conservar:** el collage de paneles con marco, el rosetón-rueda encendido, la esfera de cromo con su aro, el balcón, las líneas finas de construcción.

### FES-F — festa / corona · (visto: `fesf/g_board.png`, `e_sheet2.png`, `f_tap_crop.png`)
**Veredicto: el oro ha vuelto y el metal es 3D; identitaria todavía no.** La coronación (fila 3 de `g_board`) es rica. Lo que la rompe es el
centro de cada muro.
1. **La zona tranquila se ha dibujado como un rectángulo azul marino de esquinas redondeadas** (las cuatro «ventanas» oscuras de `g_board` y
   `e_sheet2`): parece un parche de render, y el azul-violeta no está en la fila V. No es una caja: es el mismo metal **calmado** (amplitud de
   onda ×0,3 y especular ×0,4 dentro de una elipse con borde suave de 1,2 m), en oro oscuro `#3A2A12`; el lila `#B9A3FF` sólo como contraluz en los valles.
2. **El mandala es una rueda de bicicleta / tela de araña** (radios + anillos dibujados, `f_tap_crop`). Las líneas al ≤ 20 %; la figura la hace la
   **arena de oro HDR amontonada en las líneas nodales**. Y la arena no puede ser estática de televisor rellenando la caja (`e_sheet2` fila 2):
   granos que saltan donde vibra y se quedan donde no; crece de Ø 1 m a 3 m con el orden del grupo y, al máximo, friso continuo alrededor de la sala.
3. **Las guirnaldas siguen sin estar.** Los reflejos son manchas genéricas de plató; con 2–3 hilos de bombillas `#FFD9A0` a 2,5–3,2 m el cromo
   se llena de rosarios de luz (identidad: fiesta mayor). En la coronación, jerarquía: hoy es un empapelado uniforme de destellos; un núcleo
   más denso por muro y zonas de reposo entre ellos.
**Conservar:** las esferas de cromo con su aro (ya se leen metal), la coronación, el oro, las ondas que abre cada bote.

### 3D-PO — `baixada3d` v3 · (visto: `t035/b9.png`, `f5gl.png`; INT `int/t034/sil2.png`)
**Veredicto: el cielo ya es amanecer; pro e identitaria todavía no — la ciudad son cajas y las torres, rollos de vidrio a rayas.**
1. **La ciudad: usar la silueta de la plaza de INT** (`sil2`): balaustradas, cornisas, chimeneas, una torre de reloj — es Barcelona y está
   lista. Negra a contraluz con filo melocotón `#FFD0A8` de 1,5–2 px. Fuera las cajas marrón-gris (`b9`), que son lo que más abarata la imagen.
2. **Las torres no son cilindros.** Cuatro copias iguales, una por muro, en bandas separadas por franjas oscuras (se leen como neumáticos
   apilados). **Una o dos** torres en toda la sala con la silueta asimétrica del Tronc, piso a piso, en vidrio que **quiebra el horizonte**
   (eso ya empieza a pasar en `f5gl`: llevarlo a todas las esquirlas); el resto del vidrio, lluvia que cae y jardín.
3. **Luz y color.** Todo es lila monocromo. Muro del este con el resplandor `#FFF6E0` → melocotón `#F3B9B0` en el horizonte (luminancia media
   ≥ 55 %), opuesto al 25–30 %; 1 de cada 5 esquirlas teñida (rosa, aguamarina, melocotón) y destello HDR cuando mira al este. Hoy no hay sol.
**Conservar:** el cielo con nubes, las flores de vidrio en roseta con su aro, el suelo espejo, la lluvia de esquirlas.

### RND-F — transición · (visto: `rndf/sheet-before-after.png`, `sheet-a.png`, `nat-final.png`, `sheet-env-blocks.png`)
**Veredicto: sí, ya es lenguaje propio y lleva imagen; pero se ha pasado de rosca — hoy se lee como una pared de ventanas de interfaz con neón**
(rectángulos alineados, cada uno con su halo blanco-melocotón).
1. **Fuera el halo de los marcos.** El filo, 1,5–2 px a HDR ≤ 1,2 y sin bloom; la luz vive **en la grieta** (iridiscente, del color del
   capítulo) y en el destello especular de la cara al girar. Ahora el resplandor de los bordes tapa la imagen que llevan.
2. **Jerarquía 1 : 3 : 9 y giro.** ~70 % del área son losas < 0,2 m (vuelve la «lluvia uniforme»). Al menos el 40 % del área en losas de
   0,9 m, el frente subdividido sólo donde pasa la ola; cada losa con 3–12° de giro propio en el plano y algo de inclinación: así es una ola de
   losas que se levantan, no un mosaico de cámaras de vigilancia.
3. **Color del filo por capítulo** (ronda 2, punto 2): brasa→pinya debe ir de `#FF6A1F` a `#2ED3C6`; hoy casi todo es blanco-melocotón igual
   en todas. Y el texto entrante sólo cuando la ola ha pasado por su muro (en `nat-final` la instrucción ya está mientras las losas cubren).
**Conservar:** imagen dentro de las losas, el frente de *pixel sorting*, la duración, la cartela que se deshace en teselas.

### 3D-PI — la caída · (visto: `pinya3d/fall/ksheet.png`, `obra_fall_1.png`, `o_carregat3.png`)
**Veredicto: `o_carregat3` (la plaza rompiéndose con sus faroles encendidos) sí es identitaria — es el camino; pro todavía no. `obra_fall_1`
no: la torre sigue en pie en dos muros y P2/P3 son negro con grano.**
1. **Fuera las tarjetas blancas.** Un tercio de los fragmentos que caen enseñan un reverso **blanco plano** (papel). Reverso de piedra / terracota
   `#B5583A`, `roughness 0.9`, canto iluminado; nada blanco plano > 15 cm.
2. **«Quedan las brasas»: que se vean.** Hoy es todo marrón al 20 % con nieve blanca encima (el grano cubre la imagen como ruido de vídeo: fuera).
   Charcos de luz de farol `#FFB25A` de 3–4 m, el resto en noche azul `#1B2A52`, y **brasas** `#FF6A1F` HDR 2 que quedan en el suelo entre los
   escombros y se apagan en 6–8 s. Ése es el color del texto.
3. **La caída ocurre en los cuatro muros.** Los pisos se rompen y sus piezas vuelan a P2/P3, golpean el suelo (rebote 0,3, esquirlas, polvo
   iluminado por los faroles). Ninguna pared puede esperar con sólo texto.
**Conservar:** la plaza que se desmorona en placas de su propia imagen, los faroles que siguen encendidos, la cartela «Ha caído / Quedan las brasas».

### 3D-PI — Pinya r3 · (visto: `pinya3d/a2/L_pair.png`, `L_closed_s.png`)
**Veredicto: sí — sigue aprobada.** Las cuerdas coral desde la mano y la galaxia trenzada son la imagen. Tres retoques pequeños:
1. **Las teselas del suelo** siguen siendo losas pastel planas y tres se queman a blanco (`L_pair` izquierda): 4–5 por muro, esquirla irregular
   de cromo oscuro con bisel, sin emisión.
2. **Cubos de alambre del cielo**: dispersos al azar; en rejilla ordenada al fondo al 25 %, o fuera.
3. Los nudos de la mano, el núcleo, en hueso `#F0D9C4` (hoy blanco).
**Conservar:** todo lo demás.

### GUI — acta y botón · (visto: `caps-gui/c4-acta-4.png`, `c4-acta-15.4.png`, `c4-acta-29.png`, `c4-button-rest-held.png`)
**Veredicto: acta sí — sobria, legible, de la familia.** La línea de seis colores (uno por capítulo) es exactamente la idea.
1. **«3 de 7» sale cortado por arriba** en `c4-acta-4`: comprobar que el título queda dentro del muro con margen (base ≤ 2,6 m).
2. **La línea de colores, contada**: que se dibuje segmento a segmento, de izquierda a derecha, 0,25 s cada uno, al ritmo de la voz; es el resumen de la obra.
3. **El «49»** de la barra de fuerza, alineado con la línea base de la barra y a 0,3 m de ella (hoy flota). Las teselas vacías en contorno: bien.
**Botón:** no hay captura nueva desde las 13:29; sigue pendiente la mano (ronda GUI 4: dedos redondeados en abanico, pulgar a 45°, sin el cuadrado central de «stop»).
**Conservar:** la tipografía, el cierre «Cuando los cuerpos resuenan juntos, / nace la cultura.» tal cual.

---

# RONDA 5 (ARTE-3) — 24-11, 20:25 · la obra entera la víspera de la prueba en sala

Cómo lo he mirado: una captura por bloque de `res-obra3d/index.html?demo=0` (estado congelado, una mano en P4 a 1,30 m, tira entera + P4
ampliado), en `scratchpad/arte/r5/s-<bloque>.jpg` (script `r5/shoot.sh`). 11 bloques, **0 errores de consola**. Límites honestos: la página
rinde a escala 0,5 (a escala 1 la ventana oculta no carga en 15 s), así que **la nitidez de la gráfica fina de 1 px no la puedo juzgar
aquí** — hay que mirarla en la sala; son estados forzados, no un pase natural; no he medido nada.
Criterio (ARTE-3): contención, un acento, un protagonista con aire y halo, una receta de luz, gráfica fina, texto legible siempre.
Sólo propongo cambios de **bajo riesgo** (opacidades, intensidades, recuentos, posiciones del texto): nada de geometría ni de lógica.

## Veredictos
| Bloque | ¿Elegante y limpio? | Dueño |
|---|---|---|
| Espera (umbral) | **casi** — rica e identitaria, pero es lo menos «contenido» de la obra | LUZ |
| Intro (plaça) | **sí** — azul noche + charcos de farol; no tocar | — |
| I Brasa | **casi** — atmósfera y contención bien; las gotas no son cromo y sobran las esquirlas rojas | LUZ |
| II Pinya | **sí** — la más coherente con ARTE-3 tras el Tronc | LUZ |
| III Tronc | **sí** — la imagen de ARTE-3: escultura de porcelana sobre gris azulado | TRON |
| IV Pom | **todavía no** — lo más cargado: todas las líneas gruesas y con resplandor, pegadas al texto | POV |
| V Corona | **todavía no** — lluvia de arena + curvas + brillos blancos + morado, todo a la vez | LUZ |
| V Ressonància (festa) | **todavía no** — el oro líquido es bueno; el velo índigo rectangular parece un borrón | LUZ |
| Bajada | **todavía no** — buen cielo y buena plaza a contraluz; el texto es blanco sobre porcelana blanca | LUZ + SIS |
| Caída | **sí** — granos de porcelana y trencadís sobre azul profundo; limpia | LUZ |
| Acta | **limpia pero pequeña** — instrumento fino, a escala de pantalla y no de muro | POV |

## LUZ
**Bajada (lo más urgente de toda la obra).**
1. **El texto no se lee**: «Bajadlo despacio» cae sobre el corro de porcelana blanca. Bajar la luminancia de la porcelana dentro de la caja
   del texto (±1,6 m × 1,75–2,2 m) al 35 % (la zona tranquila de la biblia §4), o que SIS suba el bloque de texto al cielo (ver SIS 1).
2. **Esquirlas quemadas**: las caras blancas planas de la torre de vidrio (0,3–0,5 m de blanco puro) → techo al 70 %; el contorno blanco
   de cada esquirla, a la mitad de opacidad (ahora se lee como alambre).
3. **La mitad inferior es negro puro** (la silueta de la plaza ocupa el 45 % del muro): levantar el pie con bruma del amanecer (degradado
   `#1A1326` → transparente, hasta 1,2 m). ARTE-3: «nunca negro puro».
**Corona + festa.**
1. **Un solo acento: oro.** El índigo/morado (valles, cuencos de las esferas, velo) compite con el oro: saturación del lila al 30 % y las
   esferas sólo cromo (fuera el casquete índigo: parecen ojos).
2. **El velo de la zona tranquila**: hoy es un rectángulo índigo borroso de 4 × 2 m. Elipse radial suave, oscuro cálido `#120C06`, 60 % de
   su opacidad actual: que sea el halo del mandala, no un parche.
3. **Corona**: arena a la mitad (recuento o brillo) y sin estela vertical (parece lluvia/ruido); curvas de nivel fuera (`contours` 0, como
   en festa); los brillos blancos del entorno, ×0,5. Que quede: cartela + cáustico de oro.
**Brasa.**
1. **Fuera las esquirlas rojas que flotan** (polígonos rojos planos = confeti): dejar sólo las brasas del suelo.
2. **Un protagonista por muro**: la gota grande de cada muro con filo (`room.rim`) y halo detrás (`room.makeHalo`), y el reflejo del
   entorno al doble; las pequeñas, ocultas o al 40 %. Hoy son botellas gris mate.
3. Nada más: el suelo y el estallido de la mano están bien.
**Pinya.** 1) Fuera los bloques de colores del suelo junto a la mano. 2) P2 y P3 siguen casi negros: la calma de la primera fila al 45 %.
3) El brazo de galaxia al 70 %: el protagonista es la gente.
**Espera.** 1) Mosaico en reposo ×0,75 y tope al faro (en P3 hay ~1,5 m de teselas casi blancas). 2) Las esquirlas sueltas del cielo, a
la mitad. 3) Los hilos blancos verticales, al 40 %.
**Caída.** Sin cambios.

## TRON
1. **Fajas en 2–3 colores, no arcoíris**: azul cobalto `#2146B0`, ocre `#E3A32B` y blanco (hoy además verde, rojo y naranja: confeti). Es
   el único color del capítulo; contenido es más elegante.
2. **Nombres de pisos que se pisan**: «BAIXOS» y «PINYA» se imprimen uno sobre otro en la vara. Separación mínima de 0,14 m entre
   etiquetas, o mostrar sólo el piso actual y el anterior.
3. **El muro sin torre** (P3, «Ayudad desde aquí») es un gris vacío: el mismo halo radial que llevan las torres, sin objeto, para que no
   parezca apagado. Y comprobar que nada blanco queda detrás de «Levantad» (hoy cae sobre el piso gris: bien; al subir la sala puede cambiar).

## POV
**Pom.**
1. **Quitar el resplandor de las líneas y bajar todo ×0,6** salvo el edificio que lleva la luz: ahora todas las aristas son gruesas, con
   halo, y el conjunto es una reja blanca. Ventanas al 35 %.
2. **Zonas tranquilas**: detrás de «Quietos / ENXANETA» y del botón, líneas al 30 % (hoy una fachada cruza el texto).
3. **Constelaciones**: los enlaces grises gruesos con nodos redondos parecen un diagrama; 1,5 px al 30 %, nodos de 3 cm.
**Acta.**
1. **Escala de muro**: el bloque de cada valor ×1,6 (nombre con mayúscula ≥ 0,30 m, barra de 2 m, teselas de 6 cm). Hoy mide ~1 m y se
   pierde en un muro de 7 m.
2. La cifra («35») en la mono del sistema y al doble.
3. La línea de 1,25 m que cruza toda la sala, al 30 % o interrumpida detrás del bloque (tacha «1,25 m» en la regla).

## SIS (guía y sistema común)
1. **Posición del texto por bloque**: en Bajada (y como seguro en Tronc) el bloque de instrucción a 2,30 m, o placa oscura al 60 % sólo en
   esos dos. Es la corrección de mayor impacto para esta noche.
2. **Gráfica fina sólo donde se lee**: sobre el mosaico de la espera y sobre las líneas del Pom, las reglas, cruces y rejilla de puntos son
   ruido → opacidad 0 en `wait` y 50 % en `pom`. En Pinya, Tronc, Brasa y Acta quedan muy bien.
3. **Anillo del botón más fino**: los segmentos blancos gruesos (sobre todo en la espera) pesan más que el vidrio; ancho al 60 % y en hueso
   al 80 %. Y **mirar en la sala a escala 1** las etiquetas mono: en mis capturas a media resolución salen dobles/borrosas («SEGONS», «1.60»);
   si en la sala también, subirlas a ≥ 5 cm de altura y 1,5 px de trazo.

## Qué pedir a Beltrán que mire esta noche en la sala
Legibilidad del texto en Bajada y Tronc; nitidez de la gráfica fina de 1 px con el proyector; si el Pom deslumbra; el nivel de negro en
P2/P3 de la Pinya; y el tamaño del acta desde el centro de la sala.
