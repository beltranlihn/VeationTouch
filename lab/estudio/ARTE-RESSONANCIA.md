# ARTE-RESSONANCIA · spec visual de «la ressonància» (bloque `festa`, T-068)

25-11-2026 · ART → FES. Una frase: **la sala es una membrana de hilos finos; cada mano es un cuerpo que la curva; cuando el grupo juega junto, la membrana se ordena y cristaliza en celdas.** Sólo líneas: ni superficies, ni partículas, ni metal.

## a) Lenguaje, fondo y paleta

- **Base: ref 03** (rejilla deformada por cuerpos → celdas de Voronoi): es la estructura de la sala y el relato de R. Encima, **ref 02** (isolíneas alrededor de cada mano que se funden) y, sólo entre manos cercanas, **ref 01** (líneas de campo que las unen).
- **Fondo oscuro**: azul tinta, la última noche antes del alba de la baixada, y contraste limpio tras el oro de la corona. `#0A0F1E` arriba → `#131A33` abajo; nunca `#000`. En el bloom sube a `#1B2444` (anuncia el alba). La corona funde a este fondo en 2 s bajando el oro, sin corte.
- **Paleta (3 tonos, no más)**: hilo **hueso** `#F2EBDD` (rejilla e isolíneas) · **cobalto claro** `#5B7CFF` (líneas de campo entre manos, eco) · **oro** `#E8B85A` (sólo resonancia: donde dos campos se tocan, y las celdas del bloom). Sin verde, cian ni amarillo neón.
- **Trazo**: grosor constante en pantalla. Rejilla 1 px al 30 % · isolíneas 1,5 px al 85 % · líneas de campo 1 px al 60 % · aristas de celda del bloom 2 px al 100 %. Antialias real; ninguna línea > 2 px.
- **Densidad**: rejilla frontal de paso **12 cm**; rejilla de fondo de paso 25 cm. Por mano: **6 isolíneas** (radios 8, 14, 22, 32, 44, 58 cm) y **12 líneas de campo**. Las líneas ocupan ≤ 12 % de los píxeles; luminancia media 0,08–0,14 (≤ 0,22 en el bloom). **Bloom de post** 0,15 con umbral 0,9: los hilos no deben engordar.
- Zonas tranquilas (texto, botón): la rejilla baja al 12 % y no entran isolíneas.

## b) Qué es cada cosa

| Estado | Qué se ve |
|---|---|
| **Mano = cuerpo** | Nodo: punto hueso Ø 3 cm + cruz «+» de 6 cm. Empuja la rejilla (lente): los hilos se apartan hasta 10 cm en el plano y la membrana se hunde hasta 0,5 m en profundidad, con caída gaussiana σ = 0,45 m. Respuesta < 100 ms; al soltar, vuelve en 1,2 s con un rebote (amortiguado, 1 oscilación). |
| **0 manos** | La rejilla respira (±1 cm, 0,15 Hz) y 2 cuerpos fantasma por muro (isolíneas al 25 %) derivan a 0,2 m/s para invitar. |
| **1 mano** | 6 anillos que respiran (±8 % de radio, 0,25 Hz, desfasados 0,3 s de dentro afuera). La mano que se mueve deja la deformación 0,6 s detrás. |
| **2 manos a < 2,5 m** | Las isolíneas exteriores **se funden** en una sola curva (metaball) y aparecen las 12 líneas de campo cobalto entre ambas; el puente de unión se tiñe de **oro**. A > 2,5 m se separan en 0,5 s. |
| **Muchas** | Un solo campo continuo por los 4 muros (cruza las costuras): las isolíneas exteriores rodean al grupo entero, como en ref 02. Máx. 16 cuerpos con isolíneas completas; el resto sólo lente. |
| **R sube (0 → 1)** | R = 0: rejilla al 20 %, con ruido de ±3 cm (hilos algo torcidos). R = 1: rejilla al 45 %, recta y estable, 9 isolíneas por mano en vez de 6, y el oro pasa del 0 al 40 % de los cruces de la rejilla dentro del campo. Cambio continuo, sin saltos. |
| **Eco** | La sala devuelve el gesto: un juego de isolíneas **discontinuas** (trazo 4/4 px, cobalto al 50 %) parte del punto tocado y llega al muro opuesto con el retardo del sonido; al llegar deforma la rejilla la mitad que una mano. |
| **Llamada** | Tres frentes rectos (tok-tok-TOK) recorren la rejilla a 3 m/s: a su paso el hilo sube a 2 px y 100 % durante 0,3 s. Los dos primeros, un muro; el tercero, la sala entera. |
| **Bloom (~4 s)** | 0–0,8 s: la rejilla se tensa y **cristaliza en celdas de Voronoi**, una por mano más semillas hasta 24–32 por muro; aristas oro de 2 px, la rejilla interior baja al 10 %. 0,8–3,2 s: figura total quieta y continua en los 4 muros, sólo un latido de ±2 %. 3,2–4 s: las aristas se relajan y vuelven a ser rejilla. Sin destello blanco. |

## c) 3D: campo en un volumen, no gráfico plano

- **Tres planos de hilo** tras el muro: isolíneas y nodos a **0 m** (nítidos, donde se toca); **membrana** (rejilla frontal) a **0,6 m**, que se hunde hasta 1,1 m bajo cada cuerpo; **rejilla de fondo** a **3 m**, al 30 % y con la mitad de deformación. El paralaje entre los tres planos al caminar es el 3D.
- Las líneas de campo son arcos en el espacio: salen del nodo, bajan hasta 0,8 m de profundidad y vuelven al otro nodo.
- Profundidad por atenuación: cada metro de fondo resta 25 % de opacidad y enfría el hueso hacia `#B9C2DC`. Sin sombras, sin relleno, sin reflejos. Hilos como cintas de grosor fijo en pantalla (no tubos con luz).
- En el bloom las celdas ganan fondo: cada arista se duplica a 0,6 m y se une con 1 hilo por vértice (prisma de alambre).

## d) Qué se quita de la festa de hoy

Placa de onda dorada · las 600.000 partículas de arena · figuras de Chladni y sus destellos en estrella · esferas de cromo · triángulos/confeti · los velos oscuros ovalados · el bloom fuerte. El oro queda sólo como tono de línea.

## e) Qué tomamos de cada referencia

1. **ref01** — líneas de campo finas entre cargas: el vínculo visible entre dos manos, y el nodo como punto. No tomamos el fondo blanco.
2. **ref02** — isolíneas concéntricas que se funden al acercarse: el gesto central de «resonar». No tomamos el neón.
3. **ref03** — **base**: rejilla blanca fina que pasa de lente suave a celdas de Voronoi en tres estados = R bajo, R alto, bloom.
4. **ref04** — la malla como tejido físico, tensa alrededor de cada cuerpo: el hundimiento en profundidad y el rebote al soltar.
