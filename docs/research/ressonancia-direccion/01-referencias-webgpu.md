# Ressonància — referencias WebGPU (estudio pieza a pieza)

Fecha: 2026-11-24. Método: cada pieza abierta sola en Chrome (1920×~900, GPU compartida con Unreal), ~3 min, interacción con ratón
(hover lento/rápido, clic, doble clic, arrastre, rueda, teclas), y lectura del bundle JS (nombres de funciones WGSL, etiquetas de
pipelines, constantes). Capturas en `refs/`.

**Cómo leer este documento.** "Observado" = lo vi en pantalla o en el código. "Inferido" = deducido de nombres de funciones/etiquetas
(no leí cada shader entero). Los costes en ms del apartado 2 son **estimaciones mías, no medidas**: hay que medirlas en la sala a
`?scale=1`. Los fps son `requestAnimationFrame` medido 2 s en esta máquina donde lo indico; en el resto, impresión visual.

## 0. Hallazgos globales (antes de las fichas)

- **Las 18 piezas de webgpu.toys son de Luis Bizarro y NO usan three.js.** Motor propio en WebGPU crudo + WGSL, bundles de 67–914 KB,
  casi sin assets (2–3 JPG de hormigón/papel, algún `.hdr`, mp3 de foley). Todo lo demás es procedural: geometría, entornos de
  estudio, ruido. La traducción a three r187 + TSL de este documento es mía; no hay código que copiar.
- **Receta de imagen común a las 18** (observada en todos los bundles): render HDR `rgba16float` → tone mapping **AgX o Neutral**
  (ACES sólo en 4) → **grano + viñeta siempre** → a menudo *streak* (destello anamórfico) y TAA (clamp YCoCg + historia Catmull-Rom).
  Entorno de estudio **analítico** (funciones `softbox`, `panel`, `studio`, `environment`), no HDRI. Sombra siempre presente (shadow map
  + oclusión de contacto). Es lo que da el aspecto "estudio de animación": luz de plató, sombra blanda, grano, y **un solo sujeto**.
- **Contención**: una idea por pieza, 1–2 materiales, fondo liso, paleta de 1–3 tonos por "colorway", y varias colorways conmutables.
- **Interacción**: todas responden a `pointermove` (hover). En la sala no hay hover: **mano presente = hover + presión a la vez**. Las
  mejores (Dominoes, Shatter, Sequins, Stardust, Myriad) no dependen del hover sino de un **gesto con consecuencia que dura**.
- **Sonido**: 9 de 18 llevan foley mp3 (`decodeAudioData`, con `playbackRate` variable); 3 sintetizan (oscilador + convolver). Ressonància
  tiene la excepción aprobada para samples propios: un foley corto por evento (con `playbackRate` variable) es parte del "peso".
- Las dos referencias añadidas: **ParticleFlow** es three r128 WebGL; **Aura** es three r185 `WebGPURenderer` + compute — la única en
  nuestra misma pila, y prueba que el look volumétrico es alcanzable con three.

Aviso de pila: el contrato del laboratorio da WebGL2 como camino de producción y dice que pasar el `<canvas>` (WebGPU) a `vt.loop`
puede caer a Spout por CPU (~20 fps a 7196×912) si la GPU compartida falla. Con `WebGPURenderer` hay que comprobar ese camino en la sala
antes del jueves.

---

## 1. Fichas

Formato: **Qué es** · **Interacción** · **Por qué se ve premium** · **Técnica** · **fps** · **Traducción a la sala**.

### 1.1 Beyblade — `refs/beyblade.jpg`
![](refs/beyblade.jpg)
- **Qué es**: siete peonzas a un lado de un estadio metálico; cada clic lanza una; chocan con lluvias de chispas, se frenan y caen.
- **Interacción**: clic en una peonza = lanzamiento. Un anillo holográfico de color alrededor de cada una muestra el giro que le queda
  (interfaz dentro de la escena). Tecla M: silencio.
- **Premium**: metal cepillado con reflejos anisótropos largos, luz de plató rasante, sombra de contacto, chispas con estela estirada
  por velocidad. La escena empieza oscura y **se enciende con la primera acción**.
- **Técnica** (inferido de `ggxAnisotropic`, `morphTop`, `rimProfile`, `vsSpark`, `fsHologram`, `toYCoCg`, `catmullRom`, `streak`):
  geometría procedural, GGX anisótropo, entorno analítico, shadow map + mapa de alturas para oclusión, chispas instanciadas, TAA,
  streak, tone map Neutral. Física en CPU (`restitution`, `friction`, `substep`). Sin compute.
- **fps**: fluido (no medido).
- **Sala**: el patrón útil es **"cada visitante aporta un actor y los actores interactúan entre sí"**: lo que hace A afecta a lo de B.
  Y el **anillo de energía restante** como temporizador legible sin texto. Solo: lanzas una y la ves vivir y morir (~20 s). Grupo: los
  choques son el espectáculo. Consecuencia de un toque: nace un cuerpo con energía finita que decae a la vista.

### 1.2 Sequins — `refs/sequins.jpg`
![](refs/sequins.jpg)
- **Qué es**: un cojín de lentejuelas reversibles que llena la pantalla.
- **Interacción**: cepillar hacia abajo voltea a la segunda cara, hacia arriba las devuelve; pulsar hunde el cojín. Flechas: acabado
  (Mermaid, Disco, Noir, Blush).
- **Premium**: **la marca se queda**. Miles de discos con iridiscencia de película fina y normal ligeramente distinta cada uno: el
  brillo "chispea" al moverse la luz. Bordes del trazo irregulares (cada lentejuela decide), no un pincel de píxeles.
- **Técnica** (inferido de etiquetas `sequin angles`, `cursor mask`, `mask layer`, `dimples`; funciones `thinFilm`, `velvet`,
  `pressAt`): instancias con un búfer de ángulo por lentejuela; el cursor pinta una **textura-máscara** persistente y cada instancia
  gira hacia el valor de la máscara en su sitio; sombra propia; fondo de terciopelo. Sin compute.
- **fps**: fluido.
- **Sala**: **la referencia más directa para "manos que dejan huella"**. Un muro entero de escamas/placas (≥ 4 cm reales cada una) que se
  voltean al paso de la mano y **no vuelven solas** (o vuelven en minutos). Dirección del gesto = cara. Solo: escribes/dibujas a escala
  de cuerpo. Grupo: el muro acumula la historia de todos; se puede pedir "voltead toda la sala" como meta colectiva. Coste bajo.

### 1.3 Lego — `refs/lego.jpg`
![](refs/lego.jpg)
- **Qué es**: una ventana que se llena de ladrillos que caen, se apilan contra los bordes y se apartan del puntero.
- **Interacción**: hover empuja; **pulsar "da la vuelta"**: toda la pila cambia de paleta (primarios → pastel) de golpe.
- **Premium**: plástico con brillo correcto, AO de contacto entre piezas, fondo blanco puro, entrada en cascada (anticipación).
- **Técnica** (observado: 2 pipelines de compute, `workgroup_size`; funciones `detect`, `solveParticle`, `solve`, `integrate`,
  `isSeparated`, `hashCell`): **sólidos rígidos en GPU**, rejilla espacial, lista de contactos por cuerpo, el puntero entra como un
  contacto más con su velocidad. MSAA, prepass normal-profundidad, sombra, entorno `studio`.
- **fps**: fluido.
- **Sala**: el montón que se aparta funciona con manos lentas (es presencia, no velocidad), pero un solver rígido en compute es el
  ítem de más riesgo para el jueves. Lo transferible barato: **el cambio global de material al pulsar** (toda la sala cambia de estado
  por una acción).

### 1.4 Lithium — `refs/lithium.jpg`, `refs/lithium-2.jpg`
![](refs/lithium.jpg)
- **Qué es**: una nube de polvo brillante en una sala de hormigón con rendijas de luz; en cada golpe de la música estalla en anillo y
  entre golpes se pliega en un nudo.
- **Interacción**: el puntero sólo mueve la cámara. La entrada real es **el audio** (comparte el audio del sistema). No lo activé.
- **Premium**: es la más cinematográfica. Bruma volumétrica atravesada por rendijas, suelo mojado que refleja con rugosidad, la nube
  **proyecta sombra en el suelo** y se autosombrea, monocromo casi total. Ritmo: expansión seca en el golpe, recogida lenta.
- **Técnica** (observado en `fn simulate`: lotes disparados por golpe, `drag`, `lifetime`, `curl`, envolvente; etiquetas `volume cells`,
  `volume density`, `volume splat`, `haze rays`, `floor reflection`, `cloud sprites`): partículas en compute con muelle + curl; las
  partículas **depositan densidad en una rejilla 3D** que da sombra/volumen; bruma por raymarching; reflexión de suelo con mips;
  3 texturas de hormigón; ACES, streak, grano.
- **fps**: fluido.
- **Sala**: **referencia de dirección de arte para Ressonància** (resonancia = golpe → anillo → recogida). La mano sustituye al golpe:
  posar la mano = cargar; al cumplir ~0,5 s, **anillo que recorre el perímetro** y la nube se recoge en un nudo delante de esa
  persona. Solo: un pulso, un nudo. Grupo: varios nudos que se atraen y, si coinciden en el tiempo, un anillo común. Lo que da calidad
  y hay que copiar: **la nube tiene sombra y hay bruma con rendijas**; sin eso son puntos sobre negro.

### 1.5 Aero — `refs/aero.jpg`
![](refs/aero.jpg)
- **Qué es**: un montón flotante de iconos "Frutiger Aero" en plástico caramelo, cromo y vidrio.
- **Interacción**: hover aparta; clic dispersa el montón y cambia de colorway (azul, verde, rosa, púrpura); flechas y espacio también.
- **Premium**: tres materiales bien diferenciados, refracción con dispersión, fondo con cintas de luz y bokeh. Monocromo por colorway.
- **Técnica** (inferido de `throughSphere`, `throughSlab`, `fsGlass`, `spectrum`, `backdropAt`, `softbox`): pase opaco y después pase de
  vidrio que **muestrea la escena ya dibujada** con refracción analítica; fondo procedural; modelos `.bin`; audio sintetizado
  (oscilador + convolver).
- **fps**: fluido.
- **Sala**: lo útil es la **disciplina de colorway** (un tono + blanco + negro, conmutable por acto) y el vidrio en dos pases. El motivo
  no encaja con la casa.

### 1.6 Mahjong — `refs/mahjong.jpg`
![](refs/mahjong.jpg)
- **Qué es**: igual que Lego con fichas de mahjong.
- **Interacción**: hover revuelve; pulsar voltea. En la captura se ve **el cambio propagándose como un frente**: media pantalla ya
  azul, la otra aún naranja.
- **Premium**: marfil + un color; glifos nítidos (tipografía `NotoSerifTC`).
- **Técnica**: mismo motor de sólidos en compute que Lego (observado `CONTACT_CAPACITY`, contacto `POINTER` con `pointerVelocity`).
- **fps**: **60,5 medido**.
- **Sala**: la lección es **el cambio de estado que se propaga con frente visible** desde el punto tocado, no un fundido global. En
  27,6 m de perímetro, un frente a ~3 m/s tarda ~5 s en dar media vuelta por cada lado: se ve llegar.

### 1.7 Specimen — `refs/specimen.jpg`, `refs/specimen-2.jpg`
![](refs/specimen.jpg)
- **Qué es**: un racimo de esferas mate visto a través de cajas-ventana; cada caja lo dibuja con otro "look".
- **Interacción**: las cajas siguen al puntero con retardo (una grande, otra pequeña rezagada); clic cambia material y looks. Cada
  caja lleva una etiqueta técnica diminuta (`#01 lineart 548×359`, coordenadas, contactos).
- **Premium**: el contraste entre un render limpio y una "radiografía" del mismo objeto. Looks vistos: térmico/rayos X, línea, silueta.
- **Técnica** (inferido de `xray`, `thermal`, `glitch`, `lineart`, `silhouette`, `halftone`, `dither`, `wire`, `ascii`, `mosaicUv`,
  `toOklab`): una sola escena; el sombreado final elige look por región rectangular; paleta en Oklab.
- **fps**: fluido.
- **Sala**: **la mano como lente** que revela otra capa de la misma imagen (lo que hay "dentro" del sonido). Muy barato: una máscara por
  mano en el post. Solo: exploras. Grupo: dos lentes que se solapan muestran una tercera capa. Dimensionar la lente ≥ 60–80 cm.

### 1.8 Type — `refs/type.jpg`
![](refs/type.jpg)
- **Qué es**: cada tecla deja caer una tecla mecánica esculpida; se amontonan.
- **Interacción**: teclado = emisor; puntero empuja; Enter voltea; Retroceso borra. Ocho temas de ordenadores clásicos.
- **Premium**: sombras largas y duras sobre fondo crema, un clac por tecla.
- **Técnica**: mismo solver en compute; leyendas por campo de distancia (`legendField`); foley mp3 por tecla.
- **fps**: fluido.
- **Sala**: sin teclado. Lo transferible es **una acción = un objeto que nace y cae con peso** y un sonido propio.

### 1.9 Droplets — `refs/droplets.jpg`
![](refs/droplets.jpg)
- **Qué es**: gotas de agua flotando con tinta que se arremolina dentro.
- **Interacción**: arrastrar lanza una gota; si choca con otra **se funden y las tintas se mezclan**; doble clic la parte en dos.
- **Premium**: el interior está vivo (la tinta sigue girando), sombra teñida por el color de la tinta, reflejo de softbox, fondo
  degradado liso. Movimiento lentísimo.
- **Técnica** (inferido de `smoothMinimum`, `field`, `marchInk`, `inkAbsorbance`, `advectVelocity`, `divergence`, `jacobi`, `project`,
  `predictDye`/`correctDye`): gotas como SDF con unión suave por raymarching; **simulación de fluido por gota en compute**; absorción de
  luz por la tinta; TAA; AgX. 11 colorways.
- **fps**: fluido.
- **Sala**: gran mecánica de grupo: **cada visitante lleva una gota de su color; al juntarlas se funden y mezclan**; separarlas las
  parte. Sin doble clic: partir = dos manos que se alejan desde la misma gota. Raymarching a 6,5 Mpx es caro: limitar a regiones.

### 1.10 Stardust — `refs/stardust.jpg`, `refs/stardust-2.jpg`
![](refs/stardust.jpg)
- **Qué es**: formas (retículas giroide, diamante, Neovius talladas en estrella, cubo, toro) hechas sólo de polvo luminoso.
- **Interacción**: el puntero deja una estela que arrastra polvo; **clic: todo el polvo fluye a la forma siguiente** (se deshace en
  nube en ~1 s, se reordena en ~4 s). Flechas: look (Nova, Lantern, Aurora, Halo, Nebula, Cocoon, Orb).
- **Premium**: el polvo **tiene volumen** porque cada grano se sombrea contra la forma (zonas oscuras dentro), hay granos desenfocados
  delante y detrás, y un halo de polvo suelto alrededor. Arranca en negro y la forma tarda ~8 s en aparecer.
- **Técnica** (observado: `SAMPLES = 262144`, `MAXIMUM_STREAK = 7`, contadores atómicos e *indirect draws* en `fn simulate`; funciones
  `statueDistance`, `statueGradient`, `softShadow`, `homeOf`, `curlNoise`, `sampleVelocity`, `capsule`): 262 144 muestras de superficie
  de un SDF; cada partícula tiene un "hogar" y vuelve con muelle; campo de fluido 2D alimentado por el puntero; sombra suave trazada
  contra el SDF; **dos capas de sprites (nítida y desenfocada)** como profundidad de campo barata; estirado por velocidad; AgX.
- **fps**: **60 medido**.
- **Sala**: **la técnica nº 1 a trasladar.** Formas de polvo de 2–3 m a lo largo de los muros; la mano abre una estela que las
  desordena y vuelven solas (respuesta local, reversible); un gesto de más peso (permanencia, o varias manos) dispara la metamorfosis
  (consecuencia global, irreversible). Solo: esculpes y ves recomponerse. Grupo: N manos a la vez = cambio de forma de toda la sala.

### 1.11 Dominoes — `refs/dominoes.jpg`
![](refs/dominoes.jpg)
- **Qué es**: dibujas una línea y se llena de fichas lacadas; al soltar, caen en cadena.
- **Interacción**: arrastrar = colocar (aparecen una a una bajo el cursor); soltar = empujar la primera. Cada línea, un color.
- **Premium**: es la mejor lección de interacción del conjunto: **preparación larga → un instante de decisión → consecuencia que se
  propaga sola** durante segundos, con un clac por ficha. Fondo de papel, una luz, sombra blanda.
- **Técnica**: instancias, física en CPU, TAA, oclusión por mapa de alturas, textura de papel, foley mp3. Sin compute.
- **fps**: fluido.
- **Sala**: encaja perfecto con manos lentas: **caminar con la mano en el muro siembra una fila; al retirar la mano, la cadena corre por
  donde pasaste**. El `up` llega ~0,3 s tarde: sirve de pausa dramática. Grupo: filas que se cruzan se contagian. Si una fila cierra
  los 360°, la cadena da la vuelta a la sala (~20 s caminando, 5–8 s cayendo).

### 1.12 Shatter — `refs/shatter.jpg`
![](refs/shatter.jpg)
- **Qué es**: una esfera de vidrio que se rompe a cámara superlenta donde haces clic; los fragmentos salen en espiral y crece otra forma.
- **Interacción**: clic = punto de impacto. Las grietas nacen **exactamente ahí**, densas cerca y grandes lejos. La luz interior se
  enciende con el golpe.
- **Premium**: **el tiempo dilatado**: un evento de 0,1 s contado en 8–10 s. Vidrio casi negro con dos reflejos, bokeh cálido, chispas.
  Tras romperse nace otra forma (octaedro) con otra paleta: ciclo completo.
- **Técnica** (inferido de `simulateShards`, `simulateGrains`, `looseness`, `pointerWake`, `fsPrepare`/`fsGather`/`upsample`,
  `environments/*.hdr`): piezas prefracturadas con "soltura" creciente desde el impacto, compute para fragmentos y polvo, DOF con bokeh
  real (círculo de confusión), entorno HDR, vidrio mp3 + reverb por convolución.
- **fps**: fluido.
- **Sala**: **un toque = un evento único, localizado e irreversible, contado despacio**. Para Ressonància: la mano agrieta una
  superficie; las grietas se propagan a ~0,5 m/s desde el punto tocado y el interior se enciende. Grupo: varias grietas que se
  encuentran sueltan un fragmento. Es el antídoto exacto de "mano → partículas".

### 1.13 Marbles — `refs/marbles.jpg`
![](refs/marbles.jpg)
- **Qué es**: canicas de vidrio que ruedan, con espirales/ojo de gato dentro.
- **Interacción**: hover empuja; pulsar cambia el juego entero de canicas (de espirales a colores lisos).
- **Premium**: **sombras de color** (la luz teñida que pasa por el vidrio), interiores distintos en cada canica.
- **Técnica** (inferido de `sphereHit`, `exitChord`, `glassAbsorption`, `catsEye`, `swirlSample`, `neighborColor`, `vsSplat`): esferas
  como impostores trazados analíticamente, interior marchado, sombra/cáustica como *splat* teñido, física en compute con "sueño", TAA.
- **fps**: fluido.
- **Sala**: el recurso barato y vistoso es la **sombra de color**: cualquier cuerpo translúcido debe teñir lo que tiene detrás.

### 1.14 Jelly — `refs/jelly.jpg`
![](refs/jelly.jpg)
- **Qué es**: una gelatina de vidrio llena de juguetitos de colores que flotan.
- **Interacción**: hover remueve el interior; clic la hace "saltar" a otra forma.
- **Premium**: refracción con dispersión en los bordes, interior denso y nítido, fondo blanco.
- **Técnica**: todo raymarching de SDF (decenas de primitivas), volumen horneado en compute, TAA, enfoque. **Tarda ~18 s en cargar**.
- **fps**: **60,5 medido** (a 1920×~900).
- **Sala**: demasiado cara a 7196×912 y de carga lenta. Sólo como objeto héroe acotado. No prioritaria.

### 1.15 Gooey — `refs/gooey.jpg`
![](refs/gooey.jpg)
- **Qué es**: una masa translúcida, húmeda y luminosa.
- **Interacción**: la rueda la hace crecer y pasa por nueve colorways con una **cortinilla horizontal** entre colores; agarrar la
  estira en hebras.
- **Premium**: luz que atraviesa la materia (bordes claros, centro oscuro), venas y burbujas, brillo de película fina. Un solo color.
- **Técnica** (inferido de `goo`, `smoothMax`, `grabStretch`, `thickness`, `interior`, `wrapDiffuse`, `thinFilm`, `worleyFbm`, etiqueta
  `noise volume`): SDF por raymarching con ruido Worley/fbm 3D horneado en compute, dispersión interna aproximada por espesor, TAA.
  El bundle más pequeño (67 KB).
- **fps**: fluido.
- **Sala**: **materia que crece con la presencia**: cuanto más tiempo/gente, más masa. Estirar hebras con la mano funciona a velocidad
  humana. Caro a pantalla completa; a media resolución y en regiones acotadas es viable.

### 1.16 Myriad — `refs/myriad.jpg`
![](refs/myriad.jpg)
- **Qué es**: rosas, copos, plumas, hojas gigantes, cada una hecha de miles de copias pequeñas de sí misma.
- **Interacción**: el puntero abolla la forma y desprende piezas que vuelan y vuelven; **clic: se deshace en una bola y se recompone en
  la forma siguiente**, con fundido del fondo a otro color.
- **Premium**: motivo y partícula coinciden (pétalos que forman una rosa), sombra propia, bloom sólo en unos pocos destellos, suelo que
  refleja, fondo de un color saturado pero oscuro.
- **Técnica** (observado: estados `ON_BODY`, `FLYING`, `AT_REST`, `DISSOLVING`, `MORPHING`; 14 tipos de partícula; funciones
  `pointerDent`, `shed`, `vortex`, `land`, `beginMorph`, `gobo`, `beam`): partículas con **máquina de estados** sobre un cuerpo SDF,
  shadow map con sombra blanda, luz con gobo y haz, bloom, reflexión de suelo, Neutral.
- **fps**: **61 medido**.
- **Sala**: junto con Stardust, la base técnica. Añade dos ideas: **la partícula es una forma con significado** (no un punto) y **las
  piezas desprendidas caen y reposan en el suelo** antes de volver (peso). Solo: desprendes pétalos. Grupo: metamorfosis.

### 1.17 Bloom — `refs/bloom.jpg`, `refs/bloom-2.jpg`
![](refs/bloom.jpg)
- **Qué es**: cuatro instalaciones vegetales (anillo, espiral, arco, parterre) en una sala de galería.
- **Interacción**: el puntero es **viento**: un fluido que mece las plantas y se lleva pétalos. La rueda pasa de instalación.
- **Premium**: **luz de ventana**: un rectángulo de sol con la sombra de la cruz del marco sobre pared y suelo, motas en el aire,
  profundidad de campo marcada, paleta de tierra. La planta crece al entrar.
- **Técnica** (inferido de `sunShadow`, `gobo`, `vogel`, `circleOfConfusion`, `sway`, `headLever`, `growth`, `sampleVelocity`,
  `capsule`, etiquetas `motes-simulate`, `fluid-*`): follaje instanciado con crecimiento, balanceo muestreando un fluido 2D que el
  puntero alimenta, motas en compute, sombra de sol con gobo y disco de Vogel, DOF, MSAA.
- **fps**: fluido.
- **Sala**: **el fluido 2D como "aire de la sala"** que todo muestrea, y **el gobo** (una luz con forma) como recurso de calidad casi
  gratis. La mano lenta genera viento por presencia y dirección, no por velocidad.

### 1.18 Worlds — `refs/worlds.jpg`, `refs/worlds-2.jpg`
![](refs/worlds.jpg)
- **Qué es**: un viaje sin fin por once jardines unidos por portales, siguiendo una cinta de luz; con música.
- **Interacción**: la rueda avanza; el puntero deja estela en el polvo; clic activa el sonido.
- **Premium**: **mundos enteros hechos sólo de sprites** (suelo, plantas, cielo, planeta) con bokeh enorme en primer plano y estirado por
  velocidad al avanzar. Una cinta blanca muy brillante guía la mirada. Paleta de 3–4 tonos por mundo.
- **Técnica** (observado: 914 KB, 17 `@compute`, `count: 32768` y `65536` por capa, `audio-spectrum`, `exposure`, `luminance`,
  `bloom-*`, `*-portal-view`, `fluid-flow`): cada mundo = simulación + sprites; portal por render a textura; estela por fluido; espectro
  de audio que modula; exposición automática; bloom; ACES.
- **fps**: **60,5 medido**.
- **Sala**: la sala ya es "estar dentro". Lo transferible: **composición por capas de sprites con profundidad** (primer plano
  desenfocado grande, medio nítido, fondo fino), **una línea de luz que recorre el perímetro** como hilo conductor, y cambio de mundo
  por portal como cambio de movimiento de la obra.

### 1.19 ParticleFlow (flow.nrly.fun, Nathan Riley / Unseen Studio) — `refs/flow.jpg`
![](refs/flow.jpg)
- **Qué es**: cuentas blancas y lima que recorren atractores extraños (Lorenz, Aizawa, Thomas, Halvorsen, Dadras, Four-Wing, Rössler,
  Nosé–Hoover) sobre un polvo de fondo.
- **Interacción**: arrastrar orbita; menú "Change formation"; **mantener espacio = estallido de color**; P pausa.
- **Premium**: dos escalas (esferas sólidas con volumen + polvo fino desenfocado), dos colores, suelo iluminado desde abajo, y la
  trayectoria matemática da un movimiento que parece coreografiado.
- **Técnica** (observado: three **r128 WebGL**, código en línea sin minificar, `InstancedMesh`, `Points`, `ShaderMaterial`; tabla `ATTR`
  con las ecuaciones y `dt` de cada atractor): las cuentas se reparten a intervalos iguales sobre una trayectoria larga precalculada y
  fluyen por ella; cambio de formación por interpolación.
- **fps**: **60 medido**.
- **Sala**: **los atractores como coreografía gratis**: un campo de velocidad analítico (3 líneas) da movimiento orgánico sin simular.
  "Mantener para cargar" es el gesto que mejor traduce a la sala (permanencia de la mano = estallido al llenarse).

### 1.20 Aura (lucerra.co/labs/aura) — `refs/aura.jpg`
![](refs/aura.jpg)
- **Qué es**: un fuego vivo que envuelve una figura animada, se inclina con el viento y suelta ascuas.
- **Interacción**: panel de parámetros (intensidad, turbulencia, altura de llama, humo, viento con azimut/elevación/rachas, 12 colores,
  bloom) y una sección **Mic**; se puede soltar un `.glb` propio.
- **Premium**: núcleo caliente / cuerpo / humo con tres colores, luz del fuego sobre el suelo, bloom contenido (fuerza 0,33, umbral 0,78).
- **Técnica** (observado: three **r185 `WebGPURenderer`**, compute, `wgslFn`, modos de SDF `signed/unsigned`, calidad `auto`): volumen
  de llama alrededor del **SDF de una malla animada**, partículas de ascuas, bloom.
- **fps**: su propio contador marcó **57 fps / 17,6 ms** en "auto: medium" (una lectura posterior de 1 fps coincidió con mi script; no
  la doy por válida).
- **Sala**: **única referencia en nuestra pila exacta**. Sirve de prueba de viabilidad y de patrón: **un aura volumétrica que envuelve
  una silueta**. En la sala la silueta puede ser la huella de la mano/cuerpo sobre el muro.

### 1.21 Skills de MengTo (leídos: `SKILL.md`, `PROMPT.md` y `demo/index.html` de ambos)
- **interactive-topography**: un campo de alturas único da curvas de nivel y relieve. Dos recetas útiles:
  - Isolíneas en GPU: `level = h/interval; d = abs(fract(level+0.5)-0.5)`, antialias con `fwidth(level)`, trazo 0,5–0,7 px (cada
    quinta, 0,9–1,1). Realce local bajo el puntero.
  - **Onda sísmica al pulsar** (leído en el demo): origen en el punto de presión, radio máximo = distancia a la esquina más lejana,
    ~1,55 s; cada grano del fondo recibe un impulso hacia fuera al llegar la cresta (`exp(-(lag/19)²)`) y un retroceso menor detrás
    (`exp(-((lag-31)/26)²)`), y vuelve a su sitio. Una nueva pulsación reinicia la onda.
  - Sala: la onda con **cresta + retroceso** es exactamente la "resonancia" legible; en 360° el radio máximo es medio perímetro (13,8 m)
    y la distancia en x debe ser circular.
- **3d-feature-objects**: objetos 3D en tarjetas que giran con el puntero. Útil sólo: suavizado `1-exp(-10·dt)`, vuelta por el camino
  angular corto `atan2(sin(Δ),cos(Δ))`, y **una receta de luz para todo el conjunto** (principal ancha, contra fría, relleno bajo).

---

## 2. Síntesis — las 10 técnicas más transferibles (orden de impacto)

Lienzo: 7196×912 = **6,56 Mpx** (3,2× un 1080p), 60 fps, presupuesto ≤ 6 ms de GPU. El límite real es **tasa de relleno**, no número de
partículas: todo lo que sea pantalla completa por píxel (raymarching, DOF, blur) va a ½ o ¼ de resolución. Nombres de nodos según el
TSL que conozco de r170–r185; **verificar cada uno contra r187** (p. ej. `PostProcessing` puede llamarse `RenderPipeline`).

### 2.1 Polvo con "hogar" sobre una forma + muelle + curl (Stardust, Myriad, Lithium, Worlds)
- Datos: `instancedArray(N,'vec4')` para `pos` (xyz + vida), `vel` (xyz + estado), `home` (xyz + semilla); N = 262 144–524 288.
- Hogares: muestrear en CPU una vez la superficie (SDF o malla) por rechazo; guardar 2–4 juegos de hogares (uno por forma) y mezclar con
  un `uniform` de morph.
- Compute: `Fn(() => { … })().compute(N)`; por partícula: `fuerza = (home - pos)·k − vel·c + curl(pos·f + time)·a + viento(pos)`;
  `renderer.compute(update)` cada frame. Curl: `Fn` propio con 3 muestras de `mx_noise_vec3` (no hay nodo de curl). Textura del fluido
  en compute: muestrear con nivel explícito.
- Dibujo: `SpriteNodeMaterial` (`positionNode = pos.toAttribute()`, `scaleNode`, `colorNode`), `blending` aditivo, `depthWrite: false`.
  Estirar el sprite por la velocidad proyectada (hasta 7× como en Stardust).
- **Volumen**: multiplicar el color por una sombra barata: `smoothstep` del SDF de la forma evaluado hacia la luz (2–4 pasos), o un
  término "dentro/fuera". Sin esto el resultado son puntos planos: es la diferencia principal con la obra actual.
- 360°: `pos.x` periódico (`mod(x, W)`), ruido sobre cilindro (`cos/sin` del ángulo).
- Coste estimado: compute 0,4–0,8 ms con 500 k; dibujo 1–2,5 ms según tamaño medio del sprite (mantener ≤ 6 px de media).

### 2.2 Fluido 2D de sala como campo compartido (Stardust, Bloom, Worlds)
- Una textura de velocidad **1024×128** (o 1800×228) `HalfFloat`, `wrapS = RepeatWrapping` (costura P3→P4 gratis).
- Pasos (ping-pong con `RenderTarget` + `QuadMesh` y `NodeMaterial`, o compute con `StorageTexture`/`textureStore`): advección →
  inyección por mano → divergencia → 12–20 Jacobi → proyección.
- Inyección tipo cápsula (segmento posición anterior → actual de cada `stroke`), con `uniformArray` de 16 manos. A ≤ 1 m/s la velocidad
  es pequeña: inyectar **presencia** (fuente radial suave) además de dirección.
- Lo muestrean partículas, follaje, humo, hebras. Coste estimado: 0,3–0,6 ms.

### 2.3 Luz con forma + bruma + motas (Lithium, Bloom, Myriad)
- Gobo: una función 2D (rendijas, marco de ventana, celosía) multiplicada por la luz principal en todos los materiales.
- Bruma: pase a **¼ de resolución** con 8–12 pasos a lo largo del rayo de luz multiplicando por el gobo y por `mx_fractal_noise_float`;
  blur separable; suma antes del tone mapping. En muros planos (vista ortográfica) se simplifica a 2D: haces = gobo desplazado + ruido.
- Motas: 20–50 k sprites lentos que sólo brillan dentro del haz.
- Coste estimado: 0,6–1,2 ms. Impacto altísimo por milisegundo.

### 2.4 Profundidad de campo por capas (Stardust, Worlds)
- No usar `dof()` a pantalla completa. Clasificar cada partícula por profundidad en 2–3 capas: nítida (2–4 px), desenfocada (disco de
  20–60 px, alfa ∝ 1/área), y primer plano enorme (pocas, 100–200 px).
- Dos opciones: capa desenfocada en un `RenderTarget` a ½ res + `gaussianBlur`; o directamente sprites grandes con disco suave.
- Coste estimado: 0,5–1 ms; vigilar el relleno de los discos grandes (≤ 2 000 a la vez).

### 2.5 Cadena de post "de estudio" (común a las 18)
- `pass(scene, camera)` en HDR → `bloom(color, fuerza 0.2–0.4, radio, umbral 0.75–0.9)` → tone mapping `AgXToneMapping` o
  `NeutralToneMapping` (no ACES: quema los saturados) → viñeta por muro → **grano** (`hash(screenCoordinate + frame)`, 2–3 %) →
  opcional `anamorphic`/streak sólo en lo más brillante.
- La viñeta va **por muro** (oscurecer hacia esquinas de cada pared), no global, o se ve una banda en la tira.
- Bloom a ½ res. Coste estimado: 1–1,5 ms.

### 2.6 Máscara persistente pintada por las manos (Sequins)
- `RenderTarget` 1800×228 (≈ 1,5 cm por texel), `R8`/`RG8`, `RepeatWrapping`. Cada frame: decaimiento opcional (0 = para siempre) +
  sello de cada mano (disco de 20–30 cm, signo según dirección vertical del gesto).
- La consumen instancias (`InstancedMesh` de 40–80 k placas con `MeshStandardNodeMaterial`; giro = `mix` hacia la máscara con retardo
  por instancia) o cualquier material como "estado local".
- Coste estimado: 0,1 ms la máscara; 1–2 ms las placas con luz. Es la forma más barata de **huella permanente**.

### 2.7 Metamorfosis con máquina de estados (Myriad, Stardust, ParticleFlow)
- Un `float` de estado por partícula (`EN_FORMA`, `VOLANDO`, `EN_REPOSO`, `DISOLVIENDO`, `MORFANDO`) en el canal libre de `vel`.
- Transición global: `DISOLVIENDO` (0,8–1 s, estalla hacia una nube), luego `MORFANDO` hacia el hogar siguiente con retardo por
  partícula (semilla) para que llegue en oleadas durante 3–4 s. Cambio de color de fondo en paralelo.
- Movimiento ambiente sin coste: campo de un atractor (Lorenz/Thomas/Aizawa) como velocidad base.
- Coste: el de 2.1. Es lo que convierte un toque en un **acontecimiento**.

### 2.8 Fractura y luz interior desde el punto tocado (Shatter)
- Sin física: patrón de grietas = bordes de `mx_worley_noise_float` en 2 escalas (densa cerca del impacto, grande lejos); revelado por
  `distancia_al_impacto < velocidad·t` con distancia circular en x; emisión en el borde + brillo interior que crece.
- Hasta 16 impactos en `uniformArray` (posición, tiempo). Opcional: fragmentos como instancias con "soltura" ∝ cercanía.
- Coste estimado: 0,5–1 ms como material de muro. Impacto alto: es localizado, irreversible y lento.

### 2.9 Onda con cresta y retroceso + reacción en cadena (topography, Dominoes, Mahjong)
- Onda: por cada impacto, `lag = r·t − dist`; desplazamiento `= dir·(A·exp(−(lag/σ)²) − 0.25·A·exp(−((lag−δ)/σ₂)²))` aplicado a
  partículas/instancias/UV. `dist` circular. Velocidad 2–3 m/s para que se vea dar la vuelta.
- Cadena: fila de instancias sembrada a lo largo del `stroke` (una cada 8–10 cm); al `up`, tiempo de caída de cada una = índice·40 ms;
  las filas que se cruzan se contagian comparando distancias en CPU (≤ 2 000 fichas).
- Coste: despreciable. Es la consecuencia **que el visitante ve alejarse de su mano**.

### 2.10 Lente de mano / segunda lectura (Specimen)
- En el nodo de salida: `mix(lookA, lookB, máscara)` con máscara = suma de discos suaves por mano (60–80 cm) con borde fino brillante.
  `lookB`: línea (derivadas de profundidad/normal vía `mrt()`), térmico (rampa sobre luminancia), o la "partitura" de la obra.
- Coste estimado: 0,2–0,5 ms (más el `mrt` si se necesita normal).

**Fuera del top 10 (deliberadamente):** sólidos rígidos en compute (Lego/Mahjong/Type: riesgo alto para el jueves) y raymarching de
vidrio/gel a pantalla completa (Droplets/Jelly/Gooey: 6,5 Mpx × 60–110 pasos no cabe en 6 ms; sólo en regiones acotadas a ½ res).

**Combinación recomendada que cabe en presupuesto** (estimación total 4,5–6 ms): 2.1 (400 k) + 2.2 + 2.3 + 2.4 + 2.5 + 2.9, con 2.7
como clímax y 2.6 o 2.8 como huella. Ofrecer `quality` que baje N y la resolución de bruma/bloom.

---

## 3. Lecciones de interacción

1. **Respuesta en dos tiempos.** Algo ocurre al instante y pequeño (la luz se enciende en Shatter, el anillo en Beyblade) y la
   consecuencia grande llega y dura segundos. En la sala las manos visuales llegan con 150 ms de retardo y el `down` de sonido es
   inmediato: **el acuse inmediato debe ser sonoro** y el visual puede crecer en 300–600 ms sin sentirse lento.
2. **Preparar → soltar → mirar.** Dominoes: el gesto prepara, el final del gesto dispara, y la consecuencia se aleja sola. Con el `up`
   ~0,3 s tarde y manos lentas, esta estructura es la que mejor encaja con el sensor.
3. **Localizado en el punto exacto.** Las grietas nacen donde se tocó (Shatter), la onda sale de ahí (topography). El visitante debe
   poder decir "eso lo he hecho yo, ahí".
4. **Peso físico.** Lo que se desprende cae y reposa (Myriad), choca y suena (Beyblade, Type), tiene sombra. Sin sombra y sin reposo no
   hay peso. Estados discretos por partícula, no un único campo de fuerzas.
5. **Huella que permanece.** Sequins no se deshace. Una marca que dura minutos convierte al visitante en autor y deja algo para el
   siguiente. Decidir por capa: reversible (estela), lenta (minutos), permanente (hasta el siguiente acto).
6. **Cambio global con frente visible.** Mahjong/Gooey: el cambio de estado recorre la imagen con un borde; no fundido. En 27,6 m de
   perímetro el frente se ve venir y obliga a girarse.
7. **Reacción en cadena y contagio.** Lo de uno afecta a lo de otro (peonzas que chocan, gotas que se funden, filas que se cruzan). Es
   el camino de grupo más natural: no hace falta coordinarse, basta coincidir.
8. **Umbral colectivo = metamorfosis.** Stardust/Myriad reservan el cambio de forma para un gesto distinto (clic). En la sala: N manos
   a la vez, o permanencia, o cerrar el círculo. Raro, grande, irreversible durante un rato.
9. **Tiempo dilatado.** Cámara lenta tras el impacto (Shatter), recomposición en 4 s (Stardust), arranque en 8 s desde negro. Lo lento
   se lee como caro. Ninguna pieza responde con un destello.
10. **Indicador dentro de la obra.** El anillo de giro restante de Beyblade: carga, energía o tiempo se leen como objeto de la escena,
    sin texto. Sirve para "mantén la mano" (un arco que se cierra en ~0,5–1 s).
11. **Presencia, no velocidad.** Todas usan la velocidad del ratón; a ≤ 1 m/s y 10 Hz eso no da señal. Sustituir por permanencia,
    área, número de manos y distancia entre manos.
12. **Un sujeto, un material, una luz.** Ninguna de las 20 mezcla más de una idea. La calidad percibida viene de quitar.
