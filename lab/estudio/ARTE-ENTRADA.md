# ARTE-ENTRADA · spec visual del bloque `wait` (T-058 / T-059)

25-11-2026 · ART → ENT, ARC, GUI. Una frase: **santuario de cerámica clara a mediodía suave; el color saturado sólo aparece donde alguien toca.**
Regla 70/20/10 de la imagen en reposo: 70 % arena-hueso (valor alto), 20 % pastel frío (agua/niebla), 10 % acento (oro viejo + lo revelado).

## a) Paleta (sRGB)

| Uso | Hex | Nota |
|---|---|---|
| Cielo cenit → horizonte → suelo lejano | `#F3E6D3` → `#E9D2B4` → `#D9BC98` | bruma `#EFDCC3` (niebla exp., 60 % de opacidad a 40 m). Contraste fondo interno ≤ 12 % de luminancia |
| Dunas/terrazas lejanas (sombra propia) | `#CFAE88` | lo más oscuro que existe en el fondo |
| Estuco de los arcos: luz / base / sombra | `#F6EEE0` / `#EADBC4` / `#C9AE8E` | rugosidad 0,85, sin metal; grano fino (bump ≤ 1 mm) |
| Oclusión más profunda permitida (intradós, contacto) | `#8A6F58` | **suelo de valor de toda la escena**: nada por debajo de L\* 45 |
| Lechada (junta) | `#F2EBDD` | mate (rugosidad 0,95), 2–3 mm, hundida 1 mm |
| **Reposo cerámica** (rug. 0,25–0,35, clearcoat suave) | hueso `#F4EDE1` 30 % · crema `#EBDCC2` 22 % · arena `#DCC3A0` 18 % · verde agua `#CFE3D8` 12 % · azul niebla `#C9D8E4` 10 % · salvia `#C5CFAE` 5 % · rosa arcilla `#E6C9BC` 3 % | variación por pieza ±4 % de valor, ±3° de tono. Agrupar en manchas de 0,4–1,2 m, no ruido uniforme |
| **Esmaltes de juego** (rug. 0,12–0,18) | cobalto `#1F3FA8` · turquesa `#1FA39A` · verde agua `#35B88A` · ocre ámbar `#E0A22B` · naranja `#E8662A` · coral `#E5574B` | por zonas en bandas (ref 01): fríos 60 %, cálidos 40 %. Emisivo ≤ 0,15: brilla por reflejo, no por luz propia |
| Filete de oro del arco | `#C9A45C` | metal 0,6, rug. 0,35; es el **único** metal |
| Tinta de texto / etiquetas mono | `#2E2A26` / `#6B5F52` | acento gráfico Saltmere: cobalto `#1F3FA8` al 100 % en progreso, 40 % en reglas de 1 px |
| Vidrio del botón | tinte `#EAF2F4` al 14 %, borde especular `#FFFFFF` 70 %, sombra de contacto `#8A6F58` 25 % | IOR 1,45, desenfoque del fondo 10–14 px, grosor aparente 2–3 cm |

## b) Luz (interior claro, mediodía suave)

- **Principal**: direccional `#FFF1DC` (≈5200 K), elevación 50–55°, **rasante en acimut 30–35° respecto al muro** para modelar biseles e intradós. Intensidad ≈ 2,6.
- **Relleno**: hemisférica cielo `#F7EBDD` / suelo `#E2C7A3`, ≈ 1,0. Ratio principal:relleno **2,5:1** (sombras a ≥ 40 % del valor de la luz).
- **Filo frío**: `#DCE8F0` a 0,35, contrario a la principal, sólo para separar el canto de los arcos.
- **Exposición**: ACES/AgX, exposición ≈ 1,0; luminancia media del frame **0,62–0,70**; blancos sin quemar (máx. 0,95 salvo destellos < 0,5 % de píxeles).
- **Bloom**: fuerza ≤ 0,08, umbral ≥ 0,95 (sólo el destello especular del esmalte y el borde del vidrio). **Sombras**: penumbra ancha (8–12 cm a 1 m), AO de radio 0,25 m al 35 %.
- **NUNCA**: negro puro ni nada < `#8A6F58` · neón o emisivos saturados · estrellas, noche, brasas, chispas · glitch / aberración cromática · astillas gruesas flotando (> 20 cm, o > 3 % de piezas fuera del muro en reposo) · líneas verticales de depuración · halos naranjas tras los arcos · texto blanco.

## c) Escala (muro ≈ 300 px/m: 1 cm = 3 px; comprobar)

- **Teselas**: 75 % de **3–6 cm**, 20 % de 6–10 cm, 5 % «madres» de 12–18 cm (nunca > 20 cm). En la franja de manos (0,6–1,8 m de alto) usar sólo ≤ 8 cm. Bisel 2–3 mm, grosor 6–8 mm. Por encima de 2,2 m se permite subir a 8–14 cm (nadie llega; ahorra piezas).
- **Acentos**: medallones redondos Ø 8–12 cm, 1 cada ~1,5 m² (ref 02); escamas de 6×8 cm sólo en 1–2 parches ≤ 0,6 m² por muro (ref 06). Relieve máximo en reposo 1,5 cm; al tocar, la pieza sale 3–6 cm y gira.
- **Arcos**: parábola/catenaria, luz 1,4–1,6 m, altura 2,3–2,5 m (proporción alto:ancho ≈ 1,6). Intradós de **40 cm** de fondo; rim de estuco de **14–18 cm** de frente con canto redondeado de radio 5–6 cm; banda de trencadís en el intradós de 20–24 cm con teselas de 2–4 cm; filete de oro de 1,5 cm entre rim y banda. Sombra de contacto de 30 cm en el suelo. El hueco del arco muestra el fondo arena, nunca oscuro.
- **Botón**: vidrio Ø **0,56–0,60 m** (r ≤ 0,30), centro a 1,25 m → ocupa ≈ 38 % del ancho del arco y deja ≥ 0,40 m de aire a cada jamba. Anillo de teselas 0,36–0,55 m con piezas de 2–3 cm, a ras (relieve ≤ 5 mm), reposo hueso/crema + 1 de cada 8 en oro. Progreso: arco de 3 px cobalto + marcas cada 10°, sin relleno ni brillo. Mano: trazo de 2–3 px tinta `#2E2A26`, sin relleno.
- **Texto**: tinta sobre claro, altura de x ≥ 5 cm (legible a 6 m), contraste ≥ 7:1; zona tranquila detrás: sólo teselas hueso/crema, sin medallones.

## d) Qué tomamos de cada referencia

1. **ref01** — los esmaltes de juego (ámbar, verde agua, cobalto) en bandas curvas, y la junta clara fina que dibuja cada pieza.
2. **ref02** — la densidad del trencadís fino (3–6 cm) y los medallones redondos como acento escaso.
3. **ref03** — el hueco del arco abierto a arena y cielo claro; la curva continua, sin aristas.
4. **ref04** — **principal**: bóveda de estuco arena con el trencadís incrustado (no recubriendo todo), suelo de terrazas, proporción 70 % arena / 30 % cerámica.
5. **ref05** — el rim blanco redondeado y grueso que enmarca el mosaico: el perfil de nuestros arcos.
6. **ref06** — escamas solapadas con brillo de esmalte, sólo en parches pequeños.
7. **ref07** — los pasteles de reposo (verde agua, crema, gris) y la sombra suave entre piezas en relieve.
8. **ref08** — el centro blanco que respira y el color en la periferia: el aire alrededor del botón.
9. **ref09** — salvia, azul niebla y blanco mate: la gama fría del reposo, en manchas.
10. **ref10** — crema + azul niebla + oliva y el tamaño que varía en gradiente (pequeño abajo, mayor arriba).
11. **ref11** — el blanco hueso como color dominante con un solo tono de acento; orden limpio.
12. **ref12** — la onda de relieve que recorre el muro al tocar (desplazamiento suave por pieza, no explosión).
