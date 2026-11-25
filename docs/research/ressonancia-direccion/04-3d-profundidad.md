# Ressonància — 04 · Que la obra se SIENTA 3D (profundidad, luz, simulación, assets)

Fecha: 2026-11-24. Investigación web + lectura de `scenes3d/room3d.js`, `scenes3d/parts/*` y `vendor/three-r187/` (rama
`lab-vicente`). No se ha tocado código. Continúa `03-recursos.md` y **no lo repite** (post, texto, ElevenLabs y Blender→glTF
básico están allí).

**Cómo leer.** **[verificado]** = comprobado esta noche en el `vendor/` local, en `files.json` de r187 o en la fuente citada.
**[aprox.]** = orden de magnitud no medido. **[sin verificar]** = conocimiento general o de memoria; probar antes de fiarse.
**[síntesis]** = práctica conocida de los estudios, no cita literal. Los costes de GPU son estimaciones para la RTX A6000 de la
sala a 7196 × 912 (6,56 Mpx, cuatro vistas); **hay que medirlos con `?scale=1`**.

---

## 0. Diagnóstico: qué hay y qué falta para que «se sienta 3D»

**Lo que ya está bien [verificado en `room3d.js`]:**

- Proyección **fuera de eje por muro** (Kooima) desde un ojo en el centro a 1,6 m: cada muro es una ventana exacta; las cuatro
  comparten esquinas. Es la base correcta de un CAVE; no hay que rehacerla.
- Tira HDR con `RepeatWrapping`, TAA propio (jitter Halton por muro, *variance clipping*, sin reproyección), bloom, PMREM con
  HDRI CC0, la receta de luz única (`lightRecipe`: una puntual cálida cenital + hemisferio + *rim* por nodo), halos, fondo en
  degradado, 300 000 motas con bokeh cercano en `atmos`.

**Lo que falta, y es justo lo que hace que hoy se lea plano [verificado por búsqueda en el código]:**

| Señal de profundidad | Estado hoy | Consecuencia |
|---|---|---|
| **Sombras arrojadas** | **Ninguna.** No hay `castShadow` ni mapas de sombra en ninguna parte | Los objetos «flotan»; no se sabe dónde tocan el suelo ni a qué distancia están |
| **Perspectiva aérea sobre los objetos** | **No hay `scene.fog` ni `fogNode`.** La bruma de `atmos` es un velo aditivo en un quad del muro: suma luz, no atenúa ni tiñe lo lejano | Lo que está a 6 m y a 60 m tiene el mismo contraste y saturación |
| **Paralaje de movimiento** | El ojo está fijo y el mundo no se traslada | Sin visitante con *tracking*, sólo el movimiento del mundo puede dar paralaje |
| **Oclusión por capas** | Depende de cada parte; no hay un primer plano sistemático en el plano del muro | Falta el «mirar A TRAVÉS de algo» |
| **Luz que revela volumen** | Una puntual sin sombra + emisivos + bloom | Luz «de videojuego»: formas iluminadas pero sin relación entre ellas |
| **Escala conocida** | Pocas figuras humanas o elementos de tamaño familiar a varias distancias | El ojo no puede calibrar la distancia |

La conclusión de todo el documento cabe aquí: **no hace falta más tecnología de render; faltan sombras, aire, capas, escala y
traslación.** Cuatro de esas cinco cosas cuestan casi 0 ms.

---

## 1. Cómo se consigue que una sala proyectada tipo CAVE se sienta 3D

### 1.1 Qué señales de profundidad tenemos y cuáles no

En la sala, el muro está a 3,2–3,7 m del centro. A esa distancia la **disparidad binocular, la convergencia y la acomodación
dicen la verdad: «superficie plana a 3,4 m»**. Sin estéreo ni *head tracking* esas tres señales juegan en contra. Todo lo que
sigue consiste en apilar las señales monoculares hasta que ganen:

| Señal | Disponible | Cómo se explota aquí |
|---|---|---|
| Oclusión (una cosa tapa a otra) | Sí, la más fuerte a cualquier distancia | Capas: marco en el plano del muro → medio → fondo → cielo (§1.4) |
| Oclusión dinámica (algo pasa por detrás de algo) | Sí | Figuras, humo y luces que cruzan por detrás de columnas |
| Tamaño relativo y tamaño familiar | Sí | Personas (1,7 m), puertas (2,1 m), escalones (17 cm) repetidos a 4, 10, 25 y 60 m |
| Altura en el campo visual + horizonte | Sí | Horizonte **exacto a la altura del ojo** (1,6 m sobre el muro), suelo que llega hasta el zócalo |
| Gradiente de textura | Sí | Pavimento de tamaño real que se comprime hacia el horizonte (con anisotropía, §1.5) |
| Perspectiva lineal | Sí, con cuidado | Verticales sí; rectas largas que crucen esquinas no (§1.3) |
| Perspectiva aérea | Sí | Niebla **radial** + de altura: lo lejano pierde contraste y se va al color del cielo (§2.2) |
| Sombras y contacto | Sí | Sombra arrojada + oscurecimiento de contacto (§2.3) |
| Sombreado / luz | Sí | Luz lateral rasante, *rim*, AO horneado |
| Paralaje de movimiento | **Sólo si el mundo se traslada** | «La sala es un ascensor / una barca» (§1.6) |
| Efecto cinético de profundidad | Sí | Objetos que giran lentamente revelan su volumen sin que nadie se mueva |
| Desenfoque (DOF) | Señal débil y arriesgada | Sólo bokeh de primer plano y enfoques de transición (§1.7) |
| Estéreo, acomodación | **No** | Minimizar lo que delata la superficie del muro: negro profundo, nada «pegado» al muro salvo lo táctil |

Referencia del orden de eficacia: Cutting y Vishton (1995) — oclusión y tamaño funcionan a todas las distancias; disparidad y
paralaje dominan por debajo de ~10 m; la perspectiva aérea sólo cuenta lejos **[sin verificar esta noche; es literatura estándar]**.

### 1.2 Lo que ya hace `room3d.js` y los dos ajustes baratos que le faltan

- **Frustum asimétrico por muro**: correcto y exacto para un espectador en el centro. No cambiar a cámaras simétricas ni a un
  equirectangular «desenrollado»: perdería la continuidad geométrica en las esquinas.
- **Plano cercano en el plano del muro.** Hoy `near = 0,05`. Todo lo que quede **entre el ojo y el muro** se dibuja
  agrandado sobre el muro y sólo es correcto desde el centro exacto (para cualquier otro visitante es una mancha gigante
  deformada). Como cada cámara mira perpendicular a su muro, el plano del muro es `z = −d`: basta `near ≈ 0,98·d` (3,1–3,6 m) o
  la regla de contenido «nada delante del muro». Efecto secundario bueno: mucha más precisión de profundidad (y `far = 400`
  deja de dar *z-fighting* lejano). Alternativa para la precisión: `new WebGPURenderer({ reversedDepthBuffer: true })`
  **[verificado: la opción existe en el build r187]**.
- **Altura del ojo 1,6 m = horizonte a 1,6 m** (43 % de un muro de 3,75 m). Es correcto para un adulto en cualquier punto de la
  sala: **el desplazamiento horizontal del visitante no mueve el horizonte**. Para un niño (ojo ~1,1 m) el suelo parece subir
  levemente; es aceptable. No subir el horizonte «para que quepa más suelo»: un horizonte alto se lee como maqueta vista desde
  arriba.

### 1.3 Qué ve quien no está en el centro, con números (y por qué manda en el contenido)

Geometría calculada para esta sala (`d` = 3,4 m del ojo al muro; `e` = lo que se aparta el visitante en paralelo al muro):

- Una imagen fija en el muro se comporta, al andar, como si **todo** estuviera en el plano del muro: **no hay paralaje entre
  capas**. El mundo «acompaña» al visitante.
- Las líneas perpendiculares al muro (un pasillo, las juntas del pavimento) fugan al pie del ojo central. Un visitante apartado
  las interpreta **inclinadas `atan(e/d)` hacia el centro**: 16° a 1 m, **24° a 1,5 m**, 36° a 2,5 m.
- Cada muro produce una inclinación distinta, así que **toda recta que cruza una esquina se quiebra** para quien no está en el
  centro. Dentro de un mismo muro las rectas siguen rectas y **las verticales siguen verticales** para todos.
- El error de posición sobre el muro de un punto a profundidad `D` detrás es `e·D/(d+D)`: 0,19 m para algo a 0,5 m detrás
  (e = 1,5 m) y 1,1 m para algo a 10 m. Lo cercano al plano del muro es «verdad» para todos; lo lejano está desplazado pero,
  al ser lejano y sin referencia, no se nota salvo en rectas y esquinas.

**Reglas de contenido que salen de aquí:**

1. **Verticales sí, rectas horizontales largas no.** Columnas, troncos, torres humanas, cuerdas, lluvia: perfectas. Cornisas,
   bordillos, hileras de ventanas y rejillas de pavimento que **atraviesan una esquina**: se quiebran.
2. **Tapar las esquinas con algo vertical del propio mundo** (una columna, un árbol, una pilastra del porche, una zona oscura).
   Es el truco clásico: lo que se quebraría queda oculto y la esquina física pasa a ser «un pilar».
3. **Formas orgánicas y redondas** (figuras, humo, brasas, tela, follaje, partículas) toleran la deformación; la arquitectura
   ortogonal la delata. Arquitectura lejana (≥ 15 m), parcial y en silueta: sí.
4. **Pavimentos irregulares o radiales** (adoquín, mosaico trencadís, anillos concéntricos alrededor del centro) en vez de
   rejilla ortogonal.
5. Lo que el público **toca y lee** vive en el plano del muro (ya es norma en `PARTS.md`).
6. **Ningún elemento a tamaño «de pantalla»** (sprites en píxeles, líneas de 1 px): todo en metros.

### 1.4 Puesta en escena por capas: el porche de la plaza

La receta que comparten las salas profesionales **[síntesis]** es una **caja escénica por capas con oclusores**:

| Capa | Distancia desde el ojo | Qué | Tratamiento |
|---|---|---|---|
| 0 · Marco | 3,4–4,0 m (plano del muro y su grosor) | Jambas, columnas, arcos, barandilla, cortina de polvo, bokeh | Casi negro, silueta nítida, a contraluz; es lo que **ocluye** |
| 1 · Acción | 5–10 m | Héroes: castell, brasa, figuras | Luz protagonista, máximo contraste y saturación, sombra arrojada |
| 2 · Medio | 12–30 m | Plaza, multitud, fachadas | Menos contraste, luces puntuales cálidas (ventanas, farolas) |
| 3 · Fondo | 40–150 m | Siluetas de tejados, campanario, montaña | Un solo tono, casi plano, fundido en la bruma |
| 4 · Cielo | ∞ | Degradado / HDRI / estrellas | Ya existe (`setBackground`) |

**Propuesta concreta y temática: la *porxada*.** Un porche catalán (arcos o dinteles sobre columnas) con su grosor real
(0,4–0,6 m) justo detrás del plano del muro, **con una columna en cada esquina de la sala**. Resuelve tres problemas a la vez:
da oclusión de primer plano (se mira la plaza *a través* de los arcos), oculta el quiebro de las esquinas y aporta escala
humana conocida. Geometría procedural (cajas + arcos con `ExtrudeGeometry`) o un GLB de Blender; pocos triángulos; coste ~0.

Regla de luminancia por capas en escena nocturna: capa 0 ≤ 3 %, capa 1 hasta 60–80 % en los acentos, capa 2 ≤ 25 %, capa 3
≤ 8 %. La profundidad se lee por **contraste decreciente**, no por brillo.

### 1.5 El suelo que continúa

El suelo real de la sala llega al zócalo del muro y la imagen empieza ahí: **si el suelo virtual está a `y = 0` y arranca en la
base del muro, el suelo físico «continúa» dentro de la imagen.** Es la ilusión más barata y más fuerte de un CAVE.

- Pavimento a **tamaño real** (las texturas CC0 de `assets/cc0` ya están: `old_mosaic_floor`, `terracotta_floor_tiles`,
  `checkered_pavement_tiles`): fijar la repetición en metros (una baldosa de 20–30 cm), no «a ojo».
- **Anisotropía máxima** en las texturas del suelo (`tex.anisotropy = renderer.getMaxAnisotropy()`, normalmente 16). Sin ella
  el suelo rasante se emborrona a 5 m y **desaparece el gradiente de textura**, que es la señal que da la profundidad del suelo.
  Coste despreciable en una A6000. **[sin verificar el valor por defecto que usan las partes]**
- **Suelo mojado / pulido**: rugosidad 0,15–0,35 con el `envMap` ya existente da reflejos de entorno gratis. Para reflejar los
  objetos: (a) duplicar la geometría instanciada con `scale.y = −1` bajo un suelo semitransparente (truco clásico, 0 pases
  extra, ×2 triángulos); (b) `reflector()` de TSL **[verificado: existe en el build]**, que cuesta **un render extra por muro**
  (×2 la escena): sólo con escena ligera y a resolución 0,5. SSR necesita una cámara única: descartado en la tira.
- Charcos: máscara de ruido que baja la rugosidad a 0,05 en manchas. Coste 0, y un punto de luz reflejado en el suelo sitúa
  la fuente en profundidad mejor que cualquier otro efecto.

### 1.6 Paralaje de movimiento sin *head tracking*: mover el mundo, nunca girarlo

- **Rotar el mundo alrededor del ojo no da paralaje**: es exactamente un desplazamiento horizontal de la tira. Marea y no
  aporta profundidad. Prohibido como recurso de «3D».
- **Trasladar el mundo sí**: lo cercano se desplaza mucho y lo lejano nada. Es la única fuente de paralaje real que tenemos.
  La sala se convierte en un vehículo: ascensor, barca, plataforma.
- **La traslación vertical es la mejor y es el tema de la obra**: la sala **sube con el castell** (tronc → pom). El horizonte
  no se mueve, las columnas del porche y las cabezas de la plaza bajan, las fachadas bajan menos, las montañas nada. En la
  *baixada*, se desciende. Una traslación de 3–6 m en 20–40 s es una lectura de profundidad imposible de conseguir de otro modo.
- Velocidades **[síntesis; calibrar en sala con gente de pie]**: lineal ≤ 0,15–0,3 m/s, aceleración suave (rampas de 3–5 s,
  nunca arranque brusco), sin cabeceo ni alabeo. De pie y rodeado al 100 % del campo visual, la vección es fuerte: a partir de
  ~0,5 m/s lateral hay quien pierde el equilibrio. El movimiento vertical lento es el mejor tolerado.
- Implementación: `room3d.js` sólo expone `setEye(y)`, que además mueve el horizonte del muro. Lo correcto es **dejar el ojo
  quieto y trasladar un grupo `world`** en sentido contrario; lo que vive en el plano del muro (objetivos, texto, la línea del
  horizonte de `atmos`) no cuelga de ese grupo. El TAA de la sala **no reproyecta** («the room's eye is still»): con el mundo
  en movimiento caerá al fotograma actual por el *clamp* (algo menos de suavizado, sin estelas). A 0,2 m/s es aceptable
  **[sin verificar]**.
- Paralaje «gratis» adicional: viento a velocidad constante **en m/s** sobre partículas a distintas profundidades (las
  cercanas cruzan rápido, las lejanas casi no); luces que se desplazan por detrás de columnas; objetos que giran despacio.

### 1.7 Profundidad de campo: decisión

El ojo del visitante enfoca el muro, así que el DOF es una convención de cine, no una señal fisiológica. Además el `dof()` de
three necesita **una** cámara (cuatro pases). Decisión recomendada:

- **Sí**: bokeh de primer plano como *sprites* grandes y blandos muy cerca del muro (ya lo hace `atmos`) y pérdida de detalle
  lejana **por niebla**, no por desenfoque.
- **Sí, puntual**: un *rack focus* de 1–2 s en una transición, hecho con el desenfoque de imagen ya disponible.
- **No**: fondo permanentemente desenfocado. A escala 1:1 se lee como proyector mal enfocado.

### 1.8 Fallos típicos en las esquinas (más allá del quiebro de rectas)

Con cuatro cámaras que comparten posición pero **no orientación**, todo lo que dependa de la *dirección* de la cámara salta en
la esquina:

| Problema | Por qué | Solución |
|---|---|---|
| **Niebla estándar de three** | `rangeFogFactor`, `densityFogFactor` y `exponentialHeightFogFactor` usan `positionView.z` (profundidad plana) **[verificado en el build]**. En esta sala rectangular (7,34 × 6,45 m) la profundidad plana de un mismo punto difiere **~14 % entre los dos muros de una esquina**, y dentro de un muro la niebla es más fina en los bordes | Niebla **radial**: factor propio con `length(positionWorld − eye)` (§2.2) |
| *Sprites* (`SpriteNodeMaterial`) grandes | Se alinean con el plano de vista de cada cámara: un halo a caballo de la esquina se dibuja con dos orientaciones | Orientarlos al **punto** del ojo (`lookAt(eye)`, como ya hace `makeHalo`), tamaño en metros |
| Partículas suaves, fundidos por `viewZ`, DOF, `linearDepth` | Misma causa | Usar distancia radial al ojo |
| Efectos de espacio de pantalla (GTAO, SSGI, SSR, SSS de contacto) | Muestrean vecinos al otro lado de la esquina, que tienen otra proyección | Aplicarlos por muro con *scissor* o no usarlos (§2.1) |
| *Billboards* de multitud / impostores | Giran con la cámara | Girarlos hacia el ojo (yaw), no hacia la cámara |
| Bloom, grano, LUT | No dependen de la cámara | Sin problema (el bloom que cruza la esquina incluso ayuda) |
| Sombras, luces, `envMap`, Fresnel/rim con `cameraPosition`, lightmaps, LightProbeGrid, VXGI, compute | Son de espacio de mundo o dependen sólo de la **posición** del ojo | Sin costura: **preferir siempre técnicas de espacio de mundo** |
| Sombras ×4 | `ShadowNode` vuelve a renderizar el mapa de sombra **por cada cámara** de un mismo fotograma (la guarda es `_cameraFrameId` por cámara) **[verificado en el build]** | `light.shadow.autoUpdate = false` y `light.shadow.needsUpdate = true` **una vez por fotograma**, antes de la primera vista |
| Mallas instanciadas con `frustumCulled = false` | Se dibujan enteras en las cuatro vistas | Partir multitudes y campos en 4–8 sectores angulares con su caja; el culling por cámara descarta 2–3 de cada 4 |

### 1.9 Qué hacen las salas profesionales para dar profundidad

Todo **[síntesis]** salvo donde se indica; sirve como catálogo de decisiones, no como cita.

| Estudio | Qué hace para la profundidad | Qué nos sirve |
|---|---|---|
| **teamLab** (Borderless, Planets) | Renuncia deliberada a la perspectiva de punto único: su «espacio ultrasubjetivo» construye el mundo en 3D y lo aplana con una regla sin punto de vista fijo, para que el plano «no sea frontera» y funcione desde cualquier posición **[verificado: teamlab.art/concept/ultrasubjective-space]**. La profundidad sale de capas de miles de elementos pequeños, espejos, suelo proyectado y obra que pasa de sala en sala | La lección contraria a la nuestra y complementaria: cuanto más orgánico y en capas, menos importa dónde esté el visitante |
| **Moment Factory** | Escenografía física + proyección: el contenido baja al suelo, hay elementos reales delante, haz de luz y bruma real que prolongan la imagen en el aire; sonido espacial sincronizado | Sincronizar un destello de luz con su sonido; pensar el muro como fondo de un escenario, no como pantalla |
| **Atelier des Lumières / Culturespaces** | Pintura 2D separada en capas con paralaje lento, proyección también en suelo, escala monumental, columnas y depósitos reales como oclusores | El movimiento lento de capas a distinta velocidad basta para leer volumen |
| **Frameless, Artechouse** | Suelos y techos espejados o proyectados, que multiplican la sala; contenido de partículas y fluidos que «desborda» el marco | El suelo reflectante (virtual, en nuestro caso) |
| **Superblue** (teamLab, Es Devlin, Turrell) | Espejo, niebla real y luz como material; Turrell: campos de color sin bordes que destruyen la referencia de la superficie (*Ganzfeld*) | Degradados amplios y sin borde hacen desaparecer el muro; el borde nítido lo delata |
| **Marshmallow Laser Feast** | Nubes de puntos de LiDAR y fotogrametría; el volumen se lee porque la cámara **viaja** a través de puntos con densidad y tamaño variables, en oscuridad total | Estética de nube de puntos = volumen barato; viaje lento de cámara |
| **d'strict** (*Wave*, esquinas LED) | Anamorfosis de punto dulce con una **caja pintada** (marco, suelo y paredes virtuales) que ancla la escena a la esquina real | El «marco virtual» de la capa 0: una caja con grosor justo detrás del muro |
| **Lusion** (web) | Luz suave horneada, AO, materiales con SSS/matcap, DOF, movimiento con física e inercia | Hornear la luz y dejar una sola luz viva; la física da peso |

---

## 2. Luz y render en three WebGPU/TSL: qué parece más caro por milisegundo

### 2.1 Tabla de decisión

Criterio decisivo en esta sala: **¿la técnica es de espacio de mundo (sin costura, una vez por fotograma) o de espacio de
pantalla (por cámara, ×4, con artefactos en esquinas)?**

| Técnica | En el `vendor/` r187 | Espacio | Coste a 7196×912 [aprox.] | Calidad percibida | ¿Esta noche? |
|---|---|---|---|---|---|
| **Niebla radial + de altura** (nodo propio) | `fog(color, factor)` acepta cualquier factor **[verificado]** | mundo | ~0 | Muy alta | **Sí, lo primero** |
| **Un mapa de sombra** (direccional o foco, PCF suave) | núcleo | mundo | 0,3–1 ms si se actualiza 1 vez/fotograma | Muy alta | **Sí** |
| **Sombra de contacto falsa** (disco/decal oscuro bajo cada objeto, o término analítico por altura) | — | mundo | ~0 | Alta | **Sí** |
| **AO horneado** (vértice o lightmap desde Blender) | `aoMap`, `lightMap`, `vertexColor` | mundo | 0 | Alta | Sí si hay GLB |
| **Lightmap al arrancar** | `lighting/LightMapper.js`, ej. `webgpu_lightmap_baking`; `misc/ProgressiveLightMapGPU.js`, ej. `webgpu_shadowmap_progressive` | mundo | 0 en marcha; segundos al cargar | Muy alta | Arriesgado: nuevo en r187, sin probar aquí |
| **Rejilla de sondas de luz** (volumen de irradiancia) | `lighting/LightProbeGrid.js`, ej. `webgpu_lightprobes`, `_complex`, `_sponza`, `webgpu_lightprobe_cubecamera` | mundo | bajo en marcha | Alta (rebote de color sobre objetos móviles) | Experimento de 2 h; no en el camino crítico |
| **VXGI** (trazado de conos en vóxeles) | `lighting/vxgi/*`, ej. `webgpu_vxgi`, `webgpu_vxgi_sponza` | mundo | alto | GI dinámica real | No esta noche (coste y madurez desconocidos) |
| **SSGI** | `tsl/display/SSGINode.js`: `resolutionScale`, `sliceCount`, `stepCount`, `useTemporalFiltering` **[verificado]**; ejemplo `webgpu_postprocessing_ssgi` | pantalla, 1 cámara | 4 pases; a 0,5 de resolución y 1×12 muestras, 3–6 ms en total | Alta en interiores | **No**: exige rehacer `room3d` como cuatro `pass()` y deja halo en esquinas |
| **GTAO** | `tsl/display/GTAONode.js` | pantalla, 1 cámara | 4 pases, 1,5–3 ms a 0,5 | Media-alta | No esta noche (misma razón) |
| **Luces de área** | `RectAreaLight` + `lights/RectAreaLightTexturesLib.js`; ej. `webgpu_lights_rectarealight` | mundo | bajo (LTC), sin sombra | Alta: ventanas, puertas, pantallas de luz | **Sí**, pocas (≤ 4–6) |
| **Volumétrica real** | `VolumeNodeMaterial` en el build **[verificado]**; ej. `webgpu_volume_lighting`, `_rectarea`, `_traa` | mundo (malla), pero el ejemplo la renderiza en un pase aparte a 0,25 | 2–5 ms si cubre toda la tira a resolución completa con 12 pasos | Muy alta | Sí como **un** volumen acotado; el TAA de la sala resuelve el *dither* Bayer |
| **Haces falsos** (conos aditivos con ruido y fundido por Fresnel) | — | mundo | ~0 (cuidado con el *overdraw*) | Alta si son pocos y finos | **Sí** |
| **Godrays de pantalla** | `tsl/display/GodraysNode.js` | pantalla, 1 cámara, 1 luz | ×4 | Alta | No |
| **SSS de material** | `MeshSSSNodeMaterial` (`thicknessColorNode`, `thicknessDistortionNode`…) **[verificado]**; ej. `webgpu_materials_sss` | mundo | ~0 | Alta en cera, piel, papel, tela a contraluz | **Sí**, selectivo |
| **Sheen / clearcoat / iridiscencia / anisotropía** | `MeshPhysicalNodeMaterial` | mundo | bajo | Media-alta | Sí |
| **Transmisión** (vidrio) | `MeshPhysicalNodeMaterial.transmission` | pase extra por cámara | ×4 pases de escena | Alta | No |
| **Cáusticas** | ej. `webgpu_caustics`, `webgpu_volume_caustics` | mundo (luz proyectada) | bajo-medio | Alta con agua o cristal | Sólo si una escena tiene agua |
| **Paralaje en superficie** | `parallaxUV` **[verificado en `three/tsl`]**; ej. `webgpu_parallax_uv` | mundo | ~0 | Media: relieve en el propio muro | Sí, para el plano del muro |
| **Triplanar** | `triplanarTexture` **[verificado]** | mundo | bajo | Evita UV en geometría procedural | Sí |

### 2.2 Niebla radial: la pieza que falta en `room3d`

Patrón (ejemplos de partida `webgpu_custom_fog`, `webgpu_fog_height`, `webgpu_custom_fog_scattering`) **[esbozo sin ejecutar]**:

```js
// distancia RADIAL al ojo (no viewZ): idéntica en los cuatro muros, sin salto en las esquinas
const eyeU   = uniform(room.eye);
const dist   = length(positionWorld.sub(eyeU));
const air    = float(1).sub(exp(dist.mul(density).negate()));                       // extinción exponencial
const ground = exp(positionWorld.y.max(0).mul(heightFalloff).negate());             // más densa junto al suelo
const factor = clamp(air.mul(mix(float(1), ground, heightAmount)), 0, maxFog);      // maxFog < 1: las siluetas nunca desaparecen del todo
scene.fogNode = fog(fogColor, factor);            // fogColor = el color del fondo en ESA dirección (muestrear el degradado de setBackground)
```

- El color de la niebla debe ser **el del fondo en la dirección del píxel** (no un color fijo): así lo lejano se funde con el
  cielo sin silueta recortada, que es exactamente la perspectiva aérea. De noche: azul-negro frío arriba, cálido en el horizonte.
- Dispersión hacia la luz: sumar un lóbulo `pow(max(dot(dirPíxel, dirLuz), 0), 8)` teñido del color de la luz protagonista. Da
  el halo de la luna/farola en el aire sin volumétrica.
- Densidades de partida: visibilidad de ~60–80 m en la plaza (densidad 0,03–0,05), el doble en *brasa* (humo). Respirar ±10 %.
- Los materiales que hoy llevan `fog: false` (halos, fondo, quad de `atmos`) siguen igual.
- Es un cambio de `room3d.js` (lo posee RND-F): debería exponerse como `room.setAir({ density, height, color })`.

### 2.3 Sombras: la receta que cabe

- **Una** luz con sombra por mundo. Para la receta actual (puntual cenital sobre el centro), una `PointLight` con sombra son 6
  caras: demasiado. Sustituir por un **foco (`SpotLight`) alto y ancho** o una **direccional** («luna») con cámara de sombra
  ortográfica que cubra el anillo de 5–30 m alrededor de la sala; la puntual queda como relleno sin sombra.
- Mapa 2048² (4096² si el anillo es grande; la A6000 lo aguanta), `PCFSoftShadowMap`, `shadow.radius` 3–6, `shadow.bias`
  −0,0005 y `normalBias` 0,02–0,05 de partida.
- **VSM**: existe (`VSMShadowFilter`, ej. `webgpu_shadowmap_vsm`), pero hay informes de artefactos (bandas, receptores que
  arrojan sombra) y **no se aplica a luces puntuales** en WebGPU; y de sombras más duras que en WebGL desde r182
  **[foro de three, sin reproducir]**. **PCSS no está integrado.** Para esta noche: PCF suave.
- **Actualizar una vez por fotograma** (ver §1.8) o, con geometría estática, una vez y nunca más (`autoUpdate = false`):
  coste 0 en marcha. Los objetos dinámicos pequeños pueden usar la sombra de contacto falsa.
- **Sombra de contacto falsa**: un disco con degradado gaussiano multiplicativo bajo cada figura/objeto, de radio ~0,6× su
  ancho, opacidad 0,5–0,7, pegado al suelo (+2 mm). Es lo que hace que algo «pise». En instancias: un `InstancedMesh` de discos.
- Sombras en cascada: `csm/CSMShadowNode.js` y `tsl/shadows/TileShadowNode.js` están en el `vendor/`, pero las cascadas se
  definen respecto a **una** cámara: no encajan con cuatro vistas. No usar.
- Hay un paquete externo, **Sundial** (sombras solares virtuales paginadas para WebGPURenderer, MIT, npm) **[visto en el foro,
  sin probar]**: innecesario a nuestra escala.

### 2.4 «La mano es una linterna», con sombra de verdad

Hoy la linterna de la mano es un término emisivo por nodo (`flash`), sin sombra. Convertir **la primera o las dos primeras
manos** en un **foco real con mapa de sombra** (1024², cono 70–90°, situado en el plano del muro y apuntando hacia fuera,
alcance 8–12 m, atenuación física) es la interacción que más profundidad da: **al mover la mano, las sombras de las columnas
y de las figuras barren el suelo y las fachadas**; ese movimiento de sombras es paralaje que el visitante controla con el
cuerpo. Las demás manos siguen con el término emisivo.

- Coste: un pase de sombra por luz y fotograma (0,3–0,8 ms cada uno con escena ligera) **[aprox.]**.
- Suavizar la posición con un muelle crítico (oculta los 10 Hz del sensor); encender en < 100 ms, apagar en 1,5–2,5 s.
- Ejemplos de partida: `webgpu_lights_spotlight`, `webgpu_shadowmap`, `webgpu_lights_projector` (un foco que proyecta una
  textura: sirve para una linterna con *gobo* de celosía), `webgpu_lights_ies_spotlight` (perfil IES, más «óptico»).

### 2.5 GI esta noche: hornear o fingir

- **Con GLB de Blender**: lightmap/AO de Cycles (flujo en `03-recursos.md` §5.2). Es GI real, coste 0, sin costuras.
- **Con geometría procedural**: (a) AO analítico — oscurecer por altura sobre el suelo y por cercanía a otros volúmenes con
  un atributo por vértice calculado al construir; (b) **rebote falso**: una `HemisphereLight` con el color del suelo iluminado
  abajo y del cielo arriba (ya está en la receta, subir el contraste cromático); (c) una `RectAreaLight` grande y tenue a ras
  de suelo con el color del pavimento iluminado imita el rebote de la luz protagonista.
- **Luces de área como ventanas**: `RectAreaLight` necesita `RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`
  **[verificado: `setLTC` existe en el build y la librería está en `jsm/lights/`]**; sólo afecta a materiales Standard/Physical
  y **no arroja sombra**. Ideal para la luz que sale de un portal o de un balcón sobre el suelo de la plaza.

### 2.6 Materiales que dan volumen

- **Rugosidad variable** (mapa o ruido): un especular que cambia al moverse la luz de la mano lee como materia. Evitar
  rugosidad < 0,25 en superficies grandes (centelleo en proyección).
- **SSS** en lo que la luz atraviesa: cera, farolillos de papel, manos, telas (*faixa*, camisas) a contraluz.
- **Sheen** (0,5–1, color cálido) para tela: borde aterciopelado que separa la figura del fondo.
- **Rim** (ya existe `rimNode`): mantenerlo fino (potencia 3–4) y frío; es la separación figura-fondo más barata.
- **Emisivos con caída**: una ventana o brasa lejana debe ser más pequeña **y** más tenue (la niebla lo hace sola si son
  geometría y no *sprites* sin `fog`).
- **Mapas de normales de las texturas CC0**: comprobar que `normalScale` no esté bajo; con luz rasante dan el relieve del
  mosaico y de la piedra.
- **Interior mapping** (habitaciones falsas tras una ventana con un solo quad): no hay nodo en three; son ~40 líneas de TSL
  (intersección rayo-caja en espacio tangente). Da profundidad real a cada ventana de una fachada por 0 triángulos
  **[técnica estándar; implementación propia, 1–2 h]**.

---

## 3. Simulaciones en GPU con compute TSL

Todos los `webgpu_*` siguientes están **[verificados en `files.json` de r187]**; código en
`https://github.com/mrdoob/three.js/blob/r187/examples/<nombre>.html`. `03-recursos.md` §1.1 ya da el patrón mínimo.

| Simulación | Punto de partida | Licencia | Notas para la sala |
|---|---|---|---|
| Partículas (10⁵–10⁶) | `webgpu_compute_particles`, `webgpu_tsl_compute_attractors_particles`, `webgpu_compute_points` | MIT | `atmos` ya mueve 300 000. En una A6000 caben 1–3 M si son pequeñas y aditivas: el límite es el *overdraw*, no el cómputo. `webgpu_compute_points` usa primitivas de punto (1 px en WebGPU): válidas para estrellas y nubes de puntos lejanas |
| Nube de puntos «MLF» | `math/MeshSurfaceSampler.js` + patrón de partículas; `webgpu_skinning_points` (puntos sobre un personaje animado) | MIT | Muestrear una malla (castell, fachada, árbol) en 0,5–2 M puntos con tamaño y brillo por distancia. Volumen legible con cero iluminación |
| Bandadas | `webgpu_compute_birds` | MIT | Pájaros, pañuelos, confeti con comportamiento; cruzan por detrás de columnas (oclusión dinámica) |
| Tela | `webgpu_compute_cloth`; externo `erik2810/webgpu-spring-mesh` (TSL; licencia **sin verificar**) | MIT | Banderas, *senyeres*, guirnaldas de la fiesta; la mano = viento |
| Fluido de partículas MLS-MPM | `webgpu_compute_particles_fluid`; **`holtsetio/flow`** (MIT **[verificado]**, https://github.com/holtsetio/flow, demo holtsetio.com/lab/flow, estética «Refik Anadol») | MIT | Sólo WebGPU (atómicas y bucles anidados; no tiene camino WebGL2). Pesado; como héroe de un capítulo, no de fondo. Referencia de la técnica: `matsuoka-601/WebGPU-Ocean` (WebGPU crudo; licencia **sin verificar**) |
| Agua de altura / ondas | `webgpu_compute_water`, `webgpu_water`, `webgpu_ocean`, `webgpu_backdrop_water` | MIT | Mano = gota; reflejos en el suelo mojado |
| Humo / fuego volumétrico | `webgpu_volume_fire`, `webgpu_volume_cloud`, `webgpu_volume_perlin`, `webgpu_compute_texture_3d`, `tsl/utils/Raymarching.js` | MIT | Lo asequible: ruido 3D advectado + `RaymarchingBox` (sin simulación). Un fluido 3D real (64³–96³ en compute + raymarch) son 4–6 h y riesgo alto |
| Cuerpos blandos | **`holtsetio/softbodies`** (FEM con tetraedros, todo en compute; https://github.com/holtsetio/softbodies; licencia **sin verificar**); `zalo/Tetrament` (TSL, three ≥ 0.182, usa three-mesh-bvh; licencia **sin verificar**) | ? | Espectacular y con peso; integración no trivial. No esta noche salvo que sea el corazón de un capítulo |
| Cuerpos rígidos | Rapier (`@dimforge/rapier3d-compat`, Apache-2.0; ver 03 §3); `misc/ConvexObjectBreaker.js` + `math/ConvexHull.js` (en el `vendor/`) para romper; `jure/webphysics`, `sbobyn/three-avbd` (GPU; **sin verificar**) | Apache-2.0 / MIT | CPU con Rapier: 500–2000 cuerpos a 60 Hz. Para la caída (*fall3d*) sirve fracturar con `ConvexObjectBreaker` y simular con Rapier |
| Arena / granular | MLS-MPM con otro modelo constitutivo (complejo) o falso: campo de altura en compute (patrón `webgpu_compute_water` con difusión por talud) + partículas de salpicadura | — | El falso se ve bien y es estable |
| Colisión con geometría | `three-mesh-bvh` (MIT) para SDF/BVH; `webgpu_compute_particles_rain` (colisión contra mapa de profundidad ortográfico) | MIT | El truco del mapa de altura ortográfico es el más barato |
| Ordenación en GPU | `webgpu_compute_sort_bitonic`, `webgpu_compute_reduce` | MIT | Para partículas con transparencia no aditiva |

**Reglas para que una simulación dé profundidad y no sólo «efecto»:** (1) vive en metros y en un volumen que **se aleja** del
muro (no en un plano paralelo a él); (2) se ilumina con la misma luz que la escena y recibe niebla; (3) tamaño de partícula en
metros con mínimo de ~1,5 px (lo hace `atmos`); (4) algo la ocluye (columna, figura) y ella ocluye el fondo; (5) el visor
(segunda instancia) corre con el recuento reducido.

---

## 4. Modelado y assets

### 4.1 Fuentes (licencia comprobada sólo donde se indica)

| Fuente | Licencia | Qué tiene | Formato | Para la obra |
|---|---|---|---|---|
| **Poly Haven** — polyhaven.com | **CC0** (ya usada; `SOURCES.md`) | HDRI, texturas PBR, ~centenares de modelos escaneados (rocas, árboles, mobiliario, piezas de arquitectura) | glTF/GLB, .blend, FBX; 1k–8k | Piedra, árboles, objetos de plaza; HDRI nocturnos |
| **ambientCG** — ambientcg.com | **CC0** | Materiales PBR, HDRI, algunos modelos, decals | PNG/JPG/EXR | Pavimentos, estucos, tela |
| **Quaternius** — quaternius.com | **CC0**, sin atribución **[según directorios; confirmar en la página del pack]** | ~80 packs; personajes base con *rig* y una biblioteca de animación universal compartida entre packs | glTF/GLB, FBX | **Figuras humanas animadas CC0**: la alternativa limpia a Mixamo. Estilizados/low-poly: usar en silueta |
| **Kenney** — kenney.nl | **CC0** | Kits low-poly (ciudad, naturaleza) | glTF, FBX, OBJ | Estilo de juego: sólo como masa lejana en silueta |
| **Smithsonian Open Access 3D** — 3d.si.edu | **CC0** en los marcados *Open Access* (comprobar el distintivo en cada ficha) | Miles de escaneos: escultura, objetos, fósiles | glTF/GLB, OBJ **[formato sin verificar esta noche]** | Estatuaria, objetos singulares de gran calidad |
| **Sketchfab** | Por modelo: filtrar *Downloadable* + **CC0** (o CC-BY con atribución anotada). Evitar NC/ND/«Editorial» | Todo; mucha fotogrametría de patrimonio CC0 de museos | glTF autoconvertido | Arquitectura catalana, campanarios, fuentes: buscar y **anotar licencia y autor** |
| **MakeHuman / MPFB2** (extensión de Blender) | Cuerpos y assets base **CC0**; el código de la herramienta es (A)GPL pero **no contamina la salida** **[sin verificar esta noche]** | Humanos paramétricos con *rig* | .blend → GLB | Figuras realistas neutras para castellers |
| **Mixamo** (Adobe) | Uso gratuito con Adobe ID, también comercial; **prohibido redistribuir los archivos sueltos**; deben ir «embebidos» en la obra. La página oficial de términos no se pudo consultar; lo anterior son respuestas del foro de Adobe **[sin verificar]** | Animaciones de calidad, auto-rig | FBX | Válido para una instalación; **no es CC0**: anotarlo, no publicar los GLB en un repo público. Preferir Quaternius si basta |
| **cgbookcase, ShareTextures** | CC0 **[sin verificar]** | Texturas PBR | — | Complemento |
| **BlenderKit** | Por asset (royalty-free o CC0) | Modelos y materiales dentro de Blender | — | Rápido, pero revisar licencia de cada asset |
| Scan the World / MyMiniFactory | **Variable, mucho CC-BY-NC** | Escultura | STL | Evitar salvo comprobación |

Todo asset nuevo: carpeta de la parte + línea en `SOURCES.md` (URL, licencia, autor, bytes), como ya se hace.

### 4.2 Blender rápido (herramientas disponibles esta noche)

Hay un **servidor MCP de Blender conectado a esta sesión** (ejecuta `bpy`): se puede generar geometría por script, hornear y
exportar sin tocar la interfaz. Las licencias GPL de los complementos de Blender **no afectan a las mallas que producen**.

- **Arquitectura procedural**: Geometry Nodes con `Mesh Line → Instance on Points` (arcadas, balcones, columnatas);
  *Array* + *Curve* para porches curvos; complemento **Archimesh** (incluido/extensión) para puertas y ventanas; **Buildify**
  (generador de edificios por nodos, gratuito en Gumroad; licencia de uso **sin verificar**).
- **Naturaleza**: **Sapling Tree Gen** (extensión oficial), **A.N.T. Landscape** (terreno), dispersión con
  `Distribute Points on Faces → Instance on Points`.
- **Multitud**: instancias de 3–5 figuras con variación de escala (±6 %), rotación y fase de animación. Exportar con la
  opción **GPU Instances** del exportador glTF (`EXT_mesh_gpu_instancing`; Blender ≥ 4.0): three la carga como `InstancedMesh`.
  Condiciones del exportador **[documentación de Blender]**: las instancias deben ser mallas que **compartan datos de malla** y
  **sin hijos**; con Geometry Nodes, «Realize Instances» rompe el instanciado. Si falla, exportar la figura y una lista de
  transformaciones en JSON y montar el `InstancedMesh` a mano (más fiable esta noche).
- **Horneado**: AO a color de vértice para masas densas; lightmap por atlas para el suelo y el porche (03 §5.2).
- **Regla de escala**: 1 unidad = 1 m, origen en el centro de la sala, suelo en `y = 0` (glTF +Y arriba), nada a menos de
  ~3,5 m del origen.

### 4.3 3D generado por IA (¡licencia!)

| Opción | Licencia de la salida | Viable esta noche |
|---|---|---|
| **TRELLIS.2** (Microsoft, pesos abiertos) | Modelo **MIT** **[verificado en la ficha de Hugging Face]**; dependencias `nvdiffrast`/`nvdiffrec` con licencia propia (sólo afectan al código, no al GLB). Exporta GLB con PBR | Probado sólo en **Linux**, pide ≥ 24 GB de VRAM (la A6000 los tiene) y CUDA 12.4. Montarlo en Windows esta noche: no |
| **Hunyuan3D** (Tencent) | Licencia comunitaria de Tencent que, según varias fuentes, **excluye la UE, Reino Unido y Corea del Sur** **[fuentes secundarias; contradictorias]** | **No usar** (estamos en la UE) |
| **Meshy** | Plan gratuito: sólo uso personal/académico **[fuente secundaria]**; planes de pago: comercial | Sólo con plan de pago |
| **Tripo** | Gratuito: fuentes contradictorias (CC-BY 4.0 frente a «no comercial»); API y planes de pago: comercial | Sólo con plan de pago y leyendo los términos |
| **Rodin** | Prueba con marca de agua **[fuente secundaria]** | No |
| **Higgsfield `generate_3d`** (herramienta conectada a esta sesión) | Depende del plan de la cuenta: **sin verificar** | Sí técnicamente; **confirmar antes** los derechos sobre la salida |

Criterio: la geometría generada por IA sirve para **atrezo de capa 2–3** (rocas, objetos de fachada, estatuas en silueta),
nunca para héroes; suele traer topología densa y texturas con luz horneada (rehornear o usarla sólo en silueta). Además, una
salida puramente generada puede no ser protegible por derecho de autor: no es un problema para usarla, sí para reclamarla.
Anotar herramienta, plan y fecha en `SOURCES.md`.

### 4.4 *Gaussian splats* en three WebGPU

| Opción | Estado | Licencia | Para nosotros |
|---|---|---|---|
| **`GaussianSplat` nativo de three r187** | **Ya está en el `vendor/`** **[verificado]**: `jsm/objects/GaussianSplat.js` + `loaders/SPZLoader.js`, `GaussianSplatPLYLoader.js`, `SPLATLoader.js`, `KSPLATLoader.js`, `GLTFGaussianSplatLoaderExtension.js`; ejemplo `webgpu_gaussian_splat`. Ordenación por conteo en compute, armónicos esféricos (contribución de Ben Houston, PR #33950/#34215/#34222) | MIT | **La vía sin dependencias.** Ordena en `onBeforeRender` **por cámara**: con cuatro vistas, cuatro ordenaciones por fotograma **[leído en el código]**. Reciente («early stages» según el propio hilo del foro) |
| **Spark 2.x** (`@sparkjsdev/spark`, World Labs) | El parámetro del renderer es `THREE.WebGLRenderer` **[verificado en los tipos 2.1.0]**: **no funciona con `WebGPURenderer`** | MIT | Descartado |
| **Spark Radix 0.0.1** (`@sparkjsdev/radix`) | Experimental; dibuja con el `WebGPURenderer` de three **r186** (peer `three@0.186`); proyección, compactación y *radix sort* en compute; un solo *draw call*; formatos PLY, SPZ, RAD, RDX; sin LOD ni raycast. 10 M de *splats* en 9,2 ms (M3 Max, 1080p) | MIT | Interesante, versión 0.0.1 y otra versión de three: no esta noche |
| **Gaussian Splat Lite 1.0** (`WilliamLiu-1997/Gaussian-Splat-Lite`) | Camino WebGPU nativo, *radix sort* en GPU, **pase de profundidad** para componer con mallas, PLY/SPZ/SOG/RAD | Apache-2.0 | Alternativa si el nativo falla |

**Qué daría:** un entorno fotográfico real (una plaza catalana capturada con un móvil — Scaniverse, Polycam, Luma — es
material propio, sin problema de licencia) como capa 2–3. Es «espacio real más allá del muro» literal. **Riesgos:** estilo
fotográfico frente a la dirección de arte nocturna y abstracta (se puede teñir, oscurecer y fundir con niebla, pero los
*splats* no reciben la luz de la escena ni arrojan sombra); composición de profundidad con mallas; cuatro ordenaciones;
tamaño (1 M de *splats* en SPZ ≈ 15–25 MB **[aprox.]**, cerca del límite de 20 MB por archivo). **Veredicto:** experimento de
alto impacto y alto riesgo; sólo si lo demás ya está hecho.

---

## 5. Geometría procedural en el navegador

| Técnica | Punto de partida | Qué da | Coste / riesgo |
|---|---|---|---|
| **Multitud con esqueleto instanciado** | `webgpu_skinning_instancing`, `webgpu_skinning_instancing_individual` (03 §1.6) | 100–500 figuras con fase propia | En una A6000, 300 figuras × 8 k triángulos es asumible si se parten en sectores (culling por vista) |
| **VAT** (animación horneada en textura) | No hay ejemplo oficial en three. Horneado propio al cargar: recorrer el clip con `AnimationMixer`, leer la posición deformada de cada vértice y escribir una textura `Float`/`HalfFloat` (vértices × fotogramas); en TSL, `positionNode = texture(vat, vec2(vertexIndex, fase))` con fase por `instanceIndex`. Exportadores de Blender: OpenVAT (**licencia sin verificar**); el estándar de Houdini VAT 3.0 tiene un port a WGSL para Babylon | Miles de figuras sin coste de huesos | 2–3 h, riesgo medio. Sólo compensa por encima de ~500 figuras; por debajo, esqueleto instanciado |
| **Impostores** | *Sprites* orientados al ojo (yaw) con 8 vistas horneadas, o simples siluetas | La masa lejana (capa 3) | 1 h; cuidado con la orientación en esquinas (§1.8) |
| **Morph instanciado** | `webgpu_instancing_morph` | Variación de pose barata | Bajo |
| **Marching cubes** | `jsm/objects/MarchingCubes.js` está en el `vendor/`, pero **no hay ejemplo `webgpu_*` en r187** **[verificado: ausente en `files.json`]**; `tronc3d/sculpt.js` ya esculpe en un *worker* | Metabolas, formas orgánicas que crecen | Compatibilidad con WebGPU **sin verificar**; usar la vía propia que ya existe |
| **SDF por raymarching mezclado con raster** | `tsl/utils/Raymarching.js` (`RaymarchingBox`), `webgpu_volume_*`; escribir `material.depthNode` para que componga con las mallas | Volúmenes blandos (humo, brasa, nube) con oclusión correcta | El raymarching en caja usa la **posición** de la cámara: sin costura entre muros. Coste proporcional al área de pantalla de la caja: acotar el volumen |
| **Terreno** | `webgpu_tsl_procedural_terrain` | Montaña lejana (Montserrat en silueta) | Bajo |
| **Topografía con curvas de nivel** | Skill `interactive-topography` de MengTo (repo **MIT** **[verificado en el README]**): un solo campo de alturas alimenta el relieve y las isolíneas; en GPU, `level = h / intervalo`, `d = abs(fract(level + 0.5) − 0.5)`, grosor con `fwidth(level)`; curvas maestras cada 5; luz rasante; onda «sísmica» desde el punto de toque con retorno amortiguado. El skill es una **receta de diseño sin código de librería** | Un suelo/paisaje que se lee como volumen **dibujado**: muy elegante y casi gratis (todo en el fragmento de un plano desplazado). La onda desde la mano encaja con nuestra interacción | 1–2 h; riesgo bajo. Para 360°, generar el campo de alturas periódico o en coordenadas de mundo |
| **Objetos «de vitrina»** | Skill `3d-feature-objects` de MengTo (MIT): silueta legible al tamaño mínimo, construir primero las piezas que definen el perfil, **tres luces** (principal amplia, borde frío, relleno bajo), rugosidades distintas por pieza, suavizado `1 − exp(−10·dt)`, retorno por el camino angular corto | Criterio para los objetos héroe (la brasa, el pom): perfil antes que detalle, y giro lento = efecto cinético de profundidad | Es criterio, no código |
| **Relieve en el propio muro** | `parallaxUV` (`webgpu_parallax_uv`), y las losas hundidas que ya hace la transición de teselas | El plano del muro deja de ser plano | Bajo |
| **Portales** | `webgpu_portal` | Una abertura a otro mundo (render a textura) | Un render extra por portal y por vista: caro; sólo uno |
| **Instancias en curva** | `webgpu_instance_path`, `modifiers/CurveModifierGPU.js` | Guirnaldas, hileras de luces que se alejan (perspectiva por tamaño) | Bajo |

---

## 6. Las 10 cosas que más aumentan la sensación 3D esta noche (por orden)

Coste de GPU **[aprox.]** en la A6000 a 7196 × 912; esfuerzo en horas de una persona que ya conoce `room3d`. Los puntos 1, 2,
3 y 4 tocan `room3d.js` (propietario RND-F): coordinar.

| # | Qué | Esfuerzo | GPU | Riesgo | Empezar por |
|---|---|---|---|---|---|
| **1** | **Aire: niebla radial + de altura con el color del fondo por dirección**, aplicada a todo (`scene.fogNode`), más lóbulo de dispersión hacia la luz protagonista (§2.2) | 1–2 h | ~0 | Bajo (única trampa: **no** usar `rangeFogFactor`/`densityFogFactor`, que saltan en las esquinas) | `webgpu_custom_fog`, `webgpu_fog_height`, `webgpu_custom_fog_scattering`; `fog(color, factor)` de `three/tsl` |
| **2** | **Sombras: una luz con mapa de sombra + sombra de contacto falsa bajo cada objeto** (§2.3) | 2–3 h | 0,3–1 ms (0 si es estática) | Medio: fijar `shadow.autoUpdate = false` + `needsUpdate` una vez por fotograma (si no, ×4); ajustar *bias*; PCF suave, no VSM | `webgpu_shadowmap`, `webgpu_lights_spotlight` |
| **3** | **Capa 0: la *porxada*** — columnas y arcos con grosor justo tras el plano del muro, **una columna en cada esquina**, casi en negro y a contraluz (§1.4) | 2–3 h (procedural) | ~0 | Bajo; comprobar que no tape la franja táctil 0,6–2,0 m más de lo debido (columnas ≤ 45 cm, vanos ≥ 2,5 m) | `ExtrudeGeometry`/cajas, o GLB por el MCP de Blender |
| **4** | **Trasladar el mundo, no girarlo**: la sala sube con el castell y baja en la *baixada* (3–6 m en 20–40 s); deriva lateral ≤ 0,1–0,2 m/s en los ambientes (§1.6) | 1–2 h + ajuste por capítulo | 0 | Medio: vección (rampas de 3–5 s, probar con gente de pie); TAA sin reproyección; lo del plano del muro no se mueve | Grupo `world` trasladado; `room.eye` quieto |
| **5** | **La mano como foco real con sombra** (1–2 manos; el resto, el término emisivo actual) (§2.4) | 2–3 h | 0,3–0,8 ms por luz | Medio: límite de luces con sombra, suavizado de la posición, no deslumbrar (≤ 30 cd) | `webgpu_lights_spotlight`, `webgpu_lights_projector`, `webgpu_lights_ies_spotlight` |
| **6** | **Suelo continuo a escala real**: pavimento en metros, anisotropía 16, rugosidad baja con charcos, horizonte a 1,6 m, juntas no ortogonales (§1.5) | 1–2 h | ~0 (reflejo real: +1 escena por muro, no) | Bajo | Texturas CC0 ya presentes; `triplanarTexture` si faltan UV |
| **7** | **Escala humana a varias profundidades**: 20–200 figuras (4, 10, 25, 60 m) en silueta con *rim* y sombra de contacto, partidas en sectores; puertas y escalones de tamaño real | 3–5 h | 0,5–2 ms | Medio (estilo de los modelos, animación; usar siluetas resuelve casi todo) | `webgpu_skinning_instancing_individual`; figuras CC0 de Quaternius o MPFB |
| **8** | **Luz que se ve en el aire**: 3–6 haces falsos (conos aditivos con ruido) desde farolas/ventanas; opcional **un** `VolumeNodeMaterial` acotado donde está el héroe, con el *dither* resuelto por el TAA | 0,5 h por haz · 3–4 h el volumen | ~0 · 2–5 ms | Bajo · medio-alto (*overdraw*, sombra dentro del volumen) | `webgpu_volume_lighting`, `webgpu_volume_lighting_traa` |
| **9** | **Luz horneada y luces de área**: AO por vértice o lightmap en el porche y el suelo; 2–4 `RectAreaLight` como portales/ventanas que derraman luz en el pavimento; puntos de luz cálidos cada vez más pequeños hacia el fondo | 2–4 h | ~0–0,5 ms | Medio (flujo Blender; `setLTC` obligatorio; las de área no dan sombra) | `webgpu_lights_rectarealight`, `webgpu_materials_lightmap`; 03 §5.2 |
| **10** | **Materia**: SSS en cera/papel/tela, *sheen* en ropa, rugosidad variable, normales con luz rasante; y **plano cercano en el muro** (`near ≈ 0,98·d`) para que nada se dibuje delante (§1.2, §2.6) | 2–3 h | ~0 | Bajo (revisar que ninguna parte dependa de geometría delante del muro) | `webgpu_materials_sss`, `MeshPhysicalNodeMaterial` |

**Orden de trabajo sugerido:** 1 → 3 → 2 → 6 (medio día de trabajo, coste de GPU casi nulo y cambian la lectura de todos
los capítulos) → 4 → 5 → 7 → 8 → 9 → 10.

**Si sobra tiempo (alto impacto, alto riesgo):** nube de puntos de 1–2 M sobre las mallas héroe (`MeshSurfaceSampler`, §3);
topografía con curvas de nivel como paisaje de un capítulo (§5); un *splat* de una plaza real como fondo (§4.4).

**No hacer esta noche:** SSGI / GTAO / SSR / DOF / godrays de pantalla (cuatro pases y rehacer `room3d`; halo en esquinas);
transmisión; sombras en cascada; VSM; Spark (sólo WebGL); fluido MLS-MPM de fondo; assets de IA como héroes; Hunyuan3D;
rotar el mundo alrededor del ojo.

---

## Pendiente de verificar

- Todos los costes de GPU (no se ha ejecutado nada): medir con `?scale=1` y con el visor abierto.
- Los esbozos de código de §2.2 no se han ejecutado.
- Tolerancia a la vección de pie: probar la traslación con 3–4 personas antes de fijar velocidades.
- Comportamiento del TAA de `room3d` con el mundo en traslación.
- Estabilidad de `LightMapper`, `LightProbeGrid`, VXGI y `GaussianSplat` nativo en r187 con cuatro vistas.
- Términos actuales de Mixamo, Quaternius (por pack), MPFB/MakeHuman, Buildify, OpenVAT, `holtsetio/softbodies`,
  `zalo/Tetrament`, y los derechos de salida de Higgsfield, Meshy y Tripo.
- Las afirmaciones sobre teamLab (salvo el concepto), Moment Factory, Culturespaces, Frameless, Artechouse, Superblue, MLF,
  d'strict y Lusion son síntesis de práctica conocida, no documentación técnica de los estudios.
- La altura de imagen (3,75 m frente a 3,5 m del perfil) cambia el porcentaje del horizonte, no su altura en metros.

## Fuentes

- three.js r187: lista de ejemplos https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/files.json · código de los
  ejemplos https://github.com/mrdoob/three.js/tree/r187/examples · docs de SSGINode https://threejs.org/docs/pages/SSGINode.html
- `vendor/three-r187/` local: `build/three.tsl.js` (niebla por `viewZ`, `fog`, `ShadowNode._cameraFrameId`, `parallaxUV`,
  `triplanarTexture`, `reflector`), `build/three.webgpu.js` (`reversedDepthBuffer`, `RectAreaLightNode.setLTC`,
  `VolumeNodeMaterial`, `MeshSSSNodeMaterial`), `jsm/objects/GaussianSplat.js`, `jsm/tsl/display/SSGINode.js`, `jsm/lighting/*`
- Sombras en WebGPU (foro de three): https://discourse.threejs.org/t/shadow-artifacts-with-webgpurenderer-vsmshadowmap/89017 ·
  https://discourse.threejs.org/t/webgpu-shadow-tests-and-findings/82561 ·
  https://discourse.threejs.org/t/webgpu-significant-performance-drop-and-shadow-quality-regression-in-r182-vs-webgl-r170/89322 ·
  https://discourse.threejs.org/t/cascaded-shadow-maps-csm-on-webgpu/84235 ·
  https://discourse.threejs.org/t/sundial-paged-virtual-sun-shadows-for-three-js-webgpurenderer-mit-on-npm/94912
- *Splats*: nativo https://discourse.threejs.org/t/native-gaussian-splatting-in-three-js-for-webgpu-renderer/93509 · Spark
  https://sparkjs.dev/ y https://github.com/sparkjsdev/spark · Radix https://sparkjs.dev/radix y
  https://radiancefields.com/spark-radix-brings-webgpu-splat-rendering-to-threejs · Gaussian Splat Lite
  https://discourse.threejs.org/t/gaussian-splat-lite-1-0-webgpu-streaming-lod-and-depth-rendering-for-three-js/94234
- Simulación: https://github.com/holtsetio/flow · https://discourse.threejs.org/t/mls-mpm-simulation-with-webgpu-and-threejs/77686 ·
  https://github.com/zalo/Tetrament · https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/
- CAVE y proyección fuera de eje: Cruz-Neira et al., SIGGRAPH 93 https://www.evl.uic.edu/documents/siggraph93-cave-cruz-neira.pdf
- teamLab, espacio ultrasubjetivo: https://www.teamlab.art/concept/ultrasubjective-space/
- Skills de MengTo (MIT): https://github.com/MengTo/Skills/tree/main/agent-skills/3d/interactive-topography ·
  https://github.com/MengTo/Skills/tree/main/agent-skills/3d/3d-feature-objects
- Assets: https://polyhaven.com · https://ambientcg.com · https://quaternius.com · https://kenney.nl · https://3d.si.edu ·
  https://sketchfab.com · lista CC0 https://github.com/madjin/awesome-cc0 · Mixamo (foro de Adobe)
  https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775
- IA 3D: https://huggingface.co/microsoft/TRELLIS.2-4B · https://www.tripo3d.ai/blog/commercial-use-ai-3d-models ·
  https://3daistudio.com/state-of-ai-3d-generation-2026
- glTF e instancias en Blender: https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html
