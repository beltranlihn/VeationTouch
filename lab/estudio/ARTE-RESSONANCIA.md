# ARTE-RESSONANCIA · v2 · agua — spec visual de «la ressonància» (bloque `festa`, T-068)

25-11-2026 · ART → FES. Sustituye a la v1 (líneas). Una frase: **los cuatro muros son la piel de un agua profunda y quieta; cada mano la hace vibrar; cuando el grupo juega junto, las ondas dejan de viajar y se quedan de pie: la sala entera suena como una placa de Faraday.**
Base aprobada de la casa: `docs/proposals/water-ripples/index.html`, **look 3 «Deep liquid»** (superficie brillante + Fresnel + líneas de contorno) con las **cáusticas del look 1** en el fondo y la **línea nodal del look 2** para la resonancia. Misma ecuación de onda, medio y malla de fotones; no reinventar.

## a) Qué es la superficie (3D)

- **Muro de agua**: la superficie líquida está **en el plano del muro** (se toca 1:1, respuesta < 100 ms) y se mira de frente con perspectiva suave (como el look 3). Continua por los 4 muros, periódica en x: las ondas cruzan las costuras.
- **Tres profundidades reales**: (1) superficie a 0 m, con relieve de onda y reflejo; (2) cuerpo de agua de 0,6 m; (3) **lecho a 0,6 m** donde caen las cáusticas y se ve, refractada, una **rejilla de hilo hueso de paso 12 cm al 15 %** (lo que sobrevive de r4: el agua la curva de verdad bajo cada onda). El paralaje superficie/lecho al caminar y la refracción (desplazamiento máx. 4 cm) dan el 3D.
- Escala de onda en el muro: velocidad 1,2 m/s · longitud de onda 10–14 cm · una gota recorre 3 m y muere en 4 s · altura visual máx. 1,5 cm (3 cm en el bloom). En reposo la superficie respira ±2 mm (0,15 Hz); nunca es un espejo muerto.

## b) Material, luz y paleta

- **Agua**: Fresnel F0 0,03 → 1 con exponente 3; reflejo máx. 60 % con hombro suave (sin chispas blancas duras); IOR 1,33; especular estrecho (exp. 500) al 12 %. Color por profundidad: `#050A16` (profundo, nunca `#000`) → `#0C1630` → `#12305A` en crestas (dispersión).
- **Luz** (reflejada, no hay luces visibles): caja suave fría `#DCE8F5` arriba-izquierda, una tira fina `#E6F0FF` abajo, relleno `#1E4E7A` a la derecha. Cáusticas en el lecho `#DCE8F5` con franja de color ≤ 5 %; ganancia tal que ≤ 3 % de píxeles pasen de 0,8.
- **Paleta (3 tonos)**: azul tinta (arriba) · **hueso frío** `#E8EEF2` (reflejos, cáusticas, líneas) · **oro** `#E8B85A`, **sólo resonancia** (líneas nodales, crestas constructivas, figura del bloom). Fuera el cian/turquesa de la demo: tinte por posición ≤ 10 %.
- **Líneas de contorno** grabadas en la superficie (isolíneas de altura, del look 3): 1 px, hueso al 8–12 %, sólo donde hay pendiente. Son el «instrumento»; no más gráfica que esa y el nodo de mano (punto Ø 3 cm + «+» de 6 cm, hueso al 60 %).
- Exposición: luminancia media 0,10–0,16 en libre, ≤ 0,25 en el bloom. Post-bloom 0,15 / umbral 0,9. En el bloom el fondo sube a `#1B2444` (anuncia el alba).

## c) Interacción

| Estado | Qué se ve |
|---|---|
| **0 manos** | Respiración ±2 mm, red de cáusticas lenta, 1 gota fantasma por muro cada 5–7 s al 30 % de amplitud. |
| **Mano que aterriza** | **Gota**: hoyuelo de Ø 12 cm y 1,5 cm, corona de 5–6 anillos que se abren a 1,2 m/s; las cáusticas dibujan los anillos en el lecho 0,1 s después. |
| **Mano sostenida** | **Fuente vibrante**: emite anillos a 3 Hz (λ 10 cm) mientras dure; si se mueve, es una fuente móvil con estela en V (ya está en la demo). |
| **2 manos** | **Interferencia**: hipérbolas de calma y de refuerzo entre ambas. A < 1,8 m las crestas reforzadas toman un filo **oro** (40 %): ése es el vínculo visible; ya no hay líneas de campo. |
| **Muchas** | Un solo campo de ondas por la sala; tope 16 fuentes, el resto sólo gota. |
| **R sube (0 → 1)** | Las ondas viajeras se amortiguan (−50 % con R = 1) y crece una **onda estacionaria de Faraday**: R 0,3 franjas · 0,6 cuadros · 0,9 hexágonos; celda de 25 → 18 cm; altura 0 → 1,2 cm; late a 2 Hz con el pulso de la música. Las **líneas nodales** (H = 0) aparecen en oro, 1 px, del 0 al 50 %. Transición continua. |
| **Eco** | Dos paquetes de onda (arco de 3 crestas, λ 20 cm, hueso) salen de la mano que aterrizó, recorren la sala en sentidos opuestos y **chocan en el muro opuesto**: cresta doble y destello oro de 0,3 s. |
| **Llamada** | Frentes **rectos** desde el centro del grupo: 4 llamadas × 3 frentes (tok-tok-TOK), λ 40 cm, 3 m/s, el tercero con el doble de altura y cáustica más marcada. Líneas, no anillos: se distinguen de las gotas. |
| **Bloom (4–8 s)** | **Figura estacionaria total**: en 0,8 s toda la sala entra en un solo modo (96 celdas de 25 cm en el perímetro, exacto en las costuras), altura 3 cm, líneas nodales oro de 2 px al 100 %, cáusticas en retícula nítida. Tramo central quieto (sólo late ±5 %). Salida: 1,5 s, la figura se rompe en anillos que se van. Sin destello blanco. |

Zonas tranquilas (texto, botón): amplitud al 30 % y sin líneas nodales.

## d) Qué sobrevive y qué se va

- **Sobrevive de la v1**: el fondo azul tinta, el oro sólo para resonar, la rejilla fina (ahora en el lecho, curvada por refracción), las isolíneas (ahora contornos reales de la onda), el nodo de mano, la continuidad en los 4 muros.
- **Se va**: líneas de campo cobalto, celdas de Voronoi, membrana de hilos en tres planos, cuerpos fantasma con anillos. Y sigue fuera todo lo de la festa antigua (placa dorada, partículas, Chladni con destellos, cromo, confeti).

## e) Referencias

1. **look 3 «Deep liquid»** — la superficie: Fresnel, caja suave, contornos grabados. Es la base.
2. **look 1 «Caustics»** — la luz en el lecho, que hace legible cada anillo a 8 m.
3. **look 2 «Cymatic lines»** — sólo la línea nodal brillante (aquí en oro) para R y el bloom.
4. **Refs de Vicente 01–04** — la lectura de cuerpos que curvan una malla (03/04) queda en la rejilla refractada; los anillos que se funden (02), en la interferencia.
