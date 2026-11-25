# ARTE-BRASA · spec visual del bloque `brasa` (T-063 / T-064)

25-11-2026 · ART → BRA, DIA. Una frase: **una hoguera de papel cortado sobre un islote de carbón en capas, en agua negra, iluminada como pieza de museo; el fuego vivo (chispas, diables) es lo único que se mueve rápido.**
Reparto de la imagen: 75 % negro cálido (aire y agua), 15 % carbón modelado, 10 % fuego. Medidas en el muro a ≈ 300 px/m (comprobar).

## a) Composición por muro (los 4 iguales en lenguaje, distinta semilla)

- **Protagonista único: la «foguera»**, escultura de 9–12 capas cortadas (ref 04 + 01), **centrada en el muro, a 3,5 m de profundidad virtual**, base en el agua. Tamaño aparente en el muro: **1,4 m de ancho × 1,5 m de alto, ápice ≤ 1,65 m** (queda bajo la zona de texto 1,75–2,2 m, que es aire negro). Capas de 2–3 cm de grosor, separadas 4–6 cm en profundidad, canto visible, cada capa con 5–9 lenguas en S; gira 2°/s y «respira» ±3 % de escala cada 6 s. Mate (rugosidad 0,8), **no emisiva salvo el núcleo**.
- **Peana: islote topográfico** (ref 02): 14–18 terrazas de carbón de 2 cm de alto, Ø 3 m, altura máx. 35 cm, con **una veta de lava** de 6–12 cm de ancho que baja del pie de la foguera hacia el visitante y muere en el anillo de brasas.
- **Contexto (quieto, bajo contraste)**: agua negra con reflejos (se queda, sin tocar); anillo de brasas (se queda, pero brasas ≤ 6 cm, sin placas rojas de 20–40 cm flotando); **curvas de nivel** finas en el plano de agua/fondo detrás del islote (ref 06), 1–1,5 px, apagadas al 8 % en reposo.
- **Fuera**: polvo/estrellas de fondo (0 partículas que no sean chispa), **los jarrones/pilares de cromo (todos; los sustituye la plaza, sección f)**, los fragmentos rojos grandes en el aire, el icono de mano blanco con halo (pasa a trazo fino crema `#F4E3C8` de 2 px). El campo de agujas (ref 07/08) **no** es un objeto de escena: se usa como textura del cuerpo de los diables (c).
- Aire: ≥ 1,2 m libres a cada lado de la foguera; nada más alto que 1,65 m salvo chispas.

## b) Paleta y luz

| Uso | Hex |
|---|---|
| Fondo (nunca `#000`): arriba → horizonte | `#0B0807` → `#1A0F0B`; halo radial tras la foguera `#3A1A0E` al 35 %, radio 2 m |
| Carbón del islote: sombra / base / luz / canto iluminado | `#141110` / `#23201E` / `#3A3531` / `#5A524B` |
| Lava: núcleo / media / borde que se enfría | `#FFD27A` / `#FF7A1A` / `#B3260E` (emisivo 2,5 / 1,5 / 0,6) |
| Capas de la foguera, de dentro afuera | crema `#F4E3C8` 15 % · ámbar `#F2B23A` 25 % · naranja `#EE6A1F` 30 % · rojo `#C8281A` 20 % · granate `#6E1410` 10 % |
| Curvas de nivel: reposo / encendidas | `#FF7A1A` al 8 % / `#FF9A3D` al 100 % (pico `#FFD27A`) |
| Agua: base / reflejo máx. | `#070605` / 60 % del color reflejado, rugosidad 0,08, onda ≤ 1,5 cm |
| Chispas: nacen / mueren | `#FFE9B0` → `#FF7A1A` → `#8A1F0E`; tamaño 2–4 px, estela 4–10 cm |
| Texto | crema `#F4E3C8`, sin halo ni sombra |

- **Llave** (museo): foco `#FFE2B8` (≈ 3800 K) desde arriba-izquierda, elevación 55°, cono 35°, penumbra 0,6, intensidad ≈ 3; sólo foguera + islote. **Filo**: `#9FB4C8` a 0,5 desde detrás-derecha, dibuja el canto de cada capa. **Relleno**: ambiente `#2A1810` a 0,15. Ratio llave:relleno ≥ 8:1. La lava y el núcleo iluminan el islote desde abajo (punto `#FF7A1A`, 1,2, radio 1,5 m).
- **Exposición**: luminancia media del frame 0,10–0,14 en reposo, ≤ 0,22 en la llamada; ≤ 2 % de píxeles > 0,9. **Bloom**: fuerza 0,35, umbral 0,85, radio 0,4 (sólo lava, chispas, núcleo; las capas mate no deben florecer). Sombras suaves de capa sobre capa (penumbra 3–5 cm).
- **Profundidad de campo**: foco en la foguera (3,5 m); desenfoque sólo a > 7 m (curvas del fondo, CoC ≤ 6 px) y en chispas a < 0,5 m del muro. Nada de bokeh en discos grandes.
- **NUNCA**: polvo/estrellas, negro puro, cromo, humo volumétrico, llamas de sprite, rojo saturado plano en placas, glitch.

## c) El correfoc (diable)

- **Figura de 1,75 m** (1,85 con cuernos), a 1,5–2,5 m de profundidad virtual, pies en el agua con reflejo. Silueta legible a 8 m: **capucha con dos cuernos de 12 cm**, casaca a media pierna, tronco inclinado 10–15° hacia delante, rodillas flexionadas, **forca** de 2,1 m a 60–75° sobre la cabeza.
- **Volumen, no nube**: cuerpo sólido de 10–14 segmentos (cápsulas/SDF) en carbón `#23201E`, iluminado por el filo frío y por su propio fuego; encima, **agujas** orientadas (ref 07/08) de 3–5 cm, 2.500–4.000 por figura, que brillan de `#B3260E` a `#FFD27A` según el calor (más en hombros, brazos y capucha). Proporción de luz: 70 % cuerpo/agujas, 30 % partículas (hoy es 100 % partículas).
- **Llamas en capas**: 5–7 lenguas de papel cortado (misma paleta y grosor que la foguera, 25–45 cm de largo) pegadas a hombros, capucha y faldón; se desprenden de una en una cada 0,4–0,8 s, suben 0,6 m girando y se apagan a granate en 1,2 s.
- **Forca + carretilles**: 2 puntas, una carretilla girando en cada una (Ø 8 cm, 3–4 vueltas/s); cada una suelta un **paraguas de chispas** en cono de 120° hacia abajo, radio 1,2–1,6 m, 150–250 chispas vivas, con gravedad y rebote en el agua (1 rebote, anillo de onda de 10 cm). Fin de la carretilla: destello `#FFE9B0` + «tro» seco, 6 chispas largas.
- **Movimiento**: pasos saltados de correfoc a 2 saltos/s, 1,4 m/s, giro completo sobre sí mismo cada 4–5 s con la forca en alto; ease-in/out, sin deslizamiento de pies; el cuerpo nunca se deshace del todo (opacidad de figura ≥ 0,8).

## d) Interacción en el lenguaje nuevo

- **Mano que aterriza** (< 100 ms): chispa en el punto + **las 3–5 curvas de nivel más cercanas se encienden** y la luz corre por ellas 1,5 m a 3 m/s (caída 1,2 s); onda en el agua de 0,6 m.
- **Mano sostenida**: las capas de la foguera del lado de la mano **se levantan 4–8 cm y se abren** (hasta 12°), la veta de lava sube de 0,6 a 2,5 de emisivo en 0,8 s; al soltar, vuelven en 1,5 s.
- **Relevo**: el diable nace de la foguera (una capa se desprende y se convierte en figura en 0,6 s), corre por el borde del islote hacia el muro siguiente; a su paso se encienden las curvas bajo sus pies (estela de 2 m). Un solo diable protagonista a la vez por muro.
- **Llamada tok-tok-TOK**: tres pulsos desde la foguera por las curvas de nivel de los cuatro muros: radio 2 m, 2 m y toda la sala; en el TOK todas las capas se abren 15°, el núcleo llega a `#FFD27A` y vuelve en 2 s. Sin flash blanco de pantalla.

## f) El fondo: «la plaça» (sustituye a los pilares negros) — decisión de ART

Una **plaza de pueblo catalán de noche**, en el mismo lenguaje de capas cortadas que el islote: es donde ocurren correfocs y castells, y da escala humana. Es **contexto**, nunca compite con la foguera.

- **Capas**: 4 planos de silueta recortada, a **12 / 16 / 20 / 26 m** de profundidad virtual; cada plano es una lámina de 15–20 cm de canto con 2–3 sub-capas de relieve (cornisas, balcones, arcos) separadas 10–15 cm. Sin texturas, sin ventanas dibujadas: sólo recorte y canto.
- **Qué se recorta**: plano 1 (12 m) **porxos**: arcada de 5–7 arcos de medio punto por muro, luz 2,2 m, altura 3 m; plano 2 (16 m) fachadas de 3 plantas con balcones (barandilla como peine de barrotes de 3 cm) y una **bocacalle** oscura de 2,5 m por muro; plano 3 (20 m) tejados escalonados; plano 4 (26 m) **un solo campanario** en toda la sala (muro P1), y perfil de tejados en los otros tres.
- **Altura aparente en el muro**: arcada hasta 1,9–2,1 m, línea de cornisa a 2,3–2,6 m, campanario hasta 2,85 m; por encima, cielo `#0B0807`. **Detrás de la foguera (±1,2 m del centro) y de la zona de texto: sólo paño liso de fachada**, sin arcos ni balcones, para que el protagonista tenga fondo limpio. La continuidad de la plaza cruza las cuatro costuras (los arcos doblan la esquina).
- **Paleta**: de cerca a lejos `#23201E` → `#1C1917` → `#161312` → `#110E0D` (perspectiva aérea: cada plano 20 % más oscuro y más cálido). Canto iluminado `#B3260E` → `#FF7A1A` sólo en los bordes inferiores de arcos, balcones y cornisas. **3–5 ventanas/faroles encendidos en toda la sala**, `#F2B23A` al 40 %, de 20×30 cm aparentes; ninguna a menos de 2 m de la foguera.
- **Luz**: iluminada **desde abajo** por el anillo de brasas y la lava (punto `#FF7A1A`, caída a 0 a los 22 m): el plano 1 recibe 100 %, el 2 55 %, el 3 25 %, el 4 sólo filo frío `#9FB4C8` a 0,2 en el perfil superior. Luminancia máxima de la plaza **≤ 0,08** (la foguera llega a 0,9): si en una captura en gris la plaza se ve antes que la foguera, está demasiado clara. En el TOK de la llamada la luz sube ×2,5 durante 0,4 s y la plaza «aparece» un instante.
- **Reflejo en el agua**: el agua llega hasta el pie de los porxos (la plaza inundada). Se reflejan sólo los cantos naranjas y las ventanas, como trazos verticales estirados ×1,5–2, rotos por la onda, al 35–45 % de intensidad y desvanecidos a 0 a 4 m del islote. La silueta negra no se refleja (negro sobre negro).
- **Profundidad de campo**: planos 3 y 4 con desenfoque suave (CoC 3–6 px); planos 1–2 nítidos. Estática: 0 movimiento salvo el parpadeo de las ventanas (±10 %, 0,3 Hz).
- **Coste**: 4 mallas extruidas o 4 quads con máscara + normal de canto; sin sombras propias.

## e) Qué tomamos de cada referencia

1. **ref01** — capas de papel en S con canto visible, rojo→ámbar sobre negro limpio; las salpicaduras como chispas redondas escasas.
2. **ref02** — el islote: terrazas de carbón en capas y una sola veta de lava. Es la base de la escena.
3. **ref03** — lenguas de llama recortadas que salen de roca negra mate; el contraste mate/negro contra color.
4. **ref04** — **principal**: la foguera como escultura-rosa sobre peana, crema en el centro, luz de museo y fondo oscuro cálido.
5. **ref05** — el corte limpio y la sombra entre capas (penumbra de 3–5 cm); el crema como capa de luz. No tomamos el blanco dominante.
6. **ref06** — curvas de nivel naranjas de 1 px sobre negro: el suelo/fondo y el lenguaje de la interacción.
7. **ref07** — campo de agujas orientadas que brilla por calor: la piel de los diables.
8. **ref08** — profundidad de campo corta y brasa interior: el foco en el protagonista y el núcleo incandescente.
