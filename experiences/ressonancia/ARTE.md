# Ressonància — arte y técnica 3D (propuesta 1)

Barcelona XR Lab × Alma Digital Studio · 23-11-2026 · para revisar con Vicente antes de seguir construyendo.

Pregunta de partida: ¿podemos llevar la obra del 2D procedural actual (sombreadores planos sobre la tira) a **universos 3D con
calidad de Unreal o Blender**, dentro de VEATION Touch, en la sala de cuatro muros? Respuesta corta: **sí, con Three.js**. Abajo, por
qué, cómo, qué cambia en el arte y qué hay que decidir.

## 1. Las referencias

**Las dos webs**
- **Random Eyes** (random-eyes.vercel.app): un ojo humano procedural (iris, pestañas, piel con poros, profundidad de campo) en
  tiempo real. Está hecho con **Three.js r186** sobre WebGL2. Lección: el realismo sale de materiales físicos (PBR: piel translúcida,
  humedad, transmisión) y de una cámara con óptica (foco, grano), no de modelos pesados.
- **Lucerra · Aura** (lucerra.co/labs/aura): fuego volumétrico que envuelve una figura humana animada y se deshace en brasas y humo.
  **Three.js r185 con WebGPU**, 59 fps. La figura es un modelo de Sketchfab (CC BY 4.0) recoloreado. Lección: un cuerpo real + una
  simulación encima = una imagen muy potente; y es justo nuestro tema (cuerpos y fuego del correfoc).

**Las siete imágenes** tienen tres hilos comunes:
1. **Materia real, fotográfica**: perla iridiscente, porcelana azul de Delft, piedra mediterránea, hojas brillantes, rosas, cobre.
2. **Rota por la señal**: *pixel sorting*, rayas de datos, desplazamientos de barrido, fragmentos de espejo flotando. La imagen
   «vibra» y se descompone en bandas.
3. **Crecimiento orgánico hecho de líneas**: las nubes de fibras azules que gotean, el árbol con un glifo de circuito encima.

**Lectura para Ressonància:** *materia real, quebrada por la vibración*. El título es física: impulsos que coinciden y se suman.
La «avería» digital de las referencias es, en nuestra obra, **la resonancia hecha visible**: la piedra, la cerámica y los cuerpos
se ven reales, y cuando el grupo vibra junto se fragmentan, se ordenan en bandas, brillan. Encaja también con el trencadís, que
ya es cerámica rota y reordenada, y con la porcelana de la referencia 6.

## 2. Cómo se ve 3D en una sala de cuatro muros

Una sala inmersiva no es una pantalla: rodea al público. La técnica correcta es la de las **CAVE**:
- Un «ojo» virtual en el centro de la sala a 1,6 m. **Una cámara por muro** con proyección *off-axis*: cada muro es una ventana
  exacta a un mundo 3D que continúa detrás. Las cuatro ventanas se tocan en las esquinas: el mundo es continuo, también de P3 a P4.
- Lo **lejano** (cielos, plazas, horizontes, una torre en mitad de la plaza) se ve bien desde cualquier punto de la sala.
  Lo **cercano** se deforma si el visitante está lejos del centro.
- Por eso **lo interactivo vive en el plano del muro**: la mano toca exactamente el sitio donde el mundo 3D «corta» la pared.
  El botón, la huella, la chispa están ahí, a escala real; el universo se abre detrás, con profundidad.
- Las cuatro vistas se pintan en la misma tira de 7196 × 912 (una por muro, como ahora) y salen por Spout igual que hoy.

## 3. Herramientas

| Herramienta | Licencia | Para qué | Veredicto |
|---|---|---|---|
| **Three.js r187** (WebGPURenderer + TSL) | MIT | Motor 3D: materiales físicos, luces, sombras, partículas en GPU (*compute*), post-proceso de cine (bloom, profundidad de campo, oclusión ambiental, reflejos, iluminación global en pantalla, antialias temporal, niebla volumétrica). Si no hay WebGPU cae solo a WebGL2. Lo usan las dos referencias. | **Recomendado como motor** |
| Gaussian splats nativos de Three.js (r186) | MIT | Escenas **capturadas de lugares reales** (una plaza, una calle, una fachada) con calidad fotográfica, como nubes de millones de puntos | Recomendado para la intro y el cierre |
| Spark 2.4 (World Labs) | MIT | Splats muy grandes con streaming y niveles de detalle (va con el renderizador WebGL de Three.js) | Plan B de los splats |
| Babylon.js 9 | Apache 2.0 | Motor más «de videojuego» (grafo de render, miles de luces, splats con sombras) | Buena alternativa; menos comunidad artística |
| pmndrs/postprocessing | Zlib | Post-proceso para el renderizador WebGL | Descartado: la licencia no está en la lista permitida, y Three.js ya trae el suyo |
| **Blender → glTF** | — | Modelar y animar cuerpos, piedra, arquitectura; exportar con texturas KTX2 y compresión meshopt | El flujo de contenido |
| Poly Haven, ambientCG | CC0 | Cielos HDRI, materiales (piedra, arcilla, cerámica), modelos | Sin restricciones |
| Mixamo, Sketchfab (CC BY) | uso libre / con crédito | Figuras humanas animadas para la pinya y los castellers | Con créditos en el cierre |
| Generación 3D con IA | según servicio | Figuras, piezas de cerámica, la plaza a partir de imágenes. El conector de Higgsfield está instalado pero hay que autorizarlo (`/mcp`) | A probar |

**Rendimiento en la sala:** el servidor tiene una RTX 6000 Ada con 48 GB. Cuatro vistas de una escena 3D con post-proceso a
7196 × 912 son asumibles; las dos referencias corren a 60 fps en un portátil. Se mide con el arnés a escala 1 y en el motor real.

**Salida:** comprobado en el código del runtime: la app de escritorio manda a Spout **lo que pinta la ventana, en la GPU**, así que
WebGPU sale igual que WebGL2 (`alma-fluid` ya usa WebGPU). La lectura por CPU sólo existe como respaldo.

## 4. Los universos, en 3D

| Bloque | Hoy (2D) | Propuesta 3D |
|---|---|---|
| **Intro: La plaça** | polvo y torre de puntos | **Una plaza real de Barcelona de noche** (piedra, arcos, balcones), capturada como splat o modelada, vista desde dentro: la sala se convierte en la plaza. La torre humana se levanta en su centro con figuras de luz. Al final la plaza **se rompe en fragmentos de espejo** que flotan (ref. 4) y se deshace en polvo. |
| **I. Brasa — Fuego** | brasas y chispas planas | **Fuego volumétrico** a ras de suelo alrededor de la sala, humo con luz, brasas con profundidad. Cada mano enciende una figura de fuego que se levanta y se disuelve (como Aura): los diables del correfoc. |
| **II. Pinya — Força** | arcilla y huellas | **Cuerpos de porcelana**: cientos de figuras humanas apretadas, vistas desde arriba, en material de porcelana o perla translúcida (refs. 1 y 6). Las manos del público empujan la masa; donde se sostiene, la porcelana se calienta y se ilumina por dentro. Al cerrar el círculo, la pinya gira. |
| **III. Tronc — Equilibri** | trencadís plano | **Una torre de trencadís real** en el centro de la plaza, vista desde los cuatro muros: fragmentos de cerámica esmaltada con brillo iridiscente, que vuelan y se encajan piso a piso. Inclinarla es inclinar un objeto 3D de verdad. |
| **IV. Pom de dalt — Valor** | cielo con hilos de oro | **Vértigo**: la cámara sube a lo alto del castell; abajo, los tejados de Barcelona de noche; arriba, **nubes de fibras** (ref. 2) que pasan cerca. Tres luces de oro trepan la torre. |
| **V. La ressonància** | ondas de oro | **La sala vibra**: la superficie de los muros se vuelve una placa de Chladni en 3D con millones de partículas; cada mano la golpea. Cuando el grupo coincide, la imagen se quiebra en **bandas de color ordenadas** (el *pixel sorting* de las refs. 5 y 7) y florece. |
| **Bajada y acta** | lluvia y tipografía | Los fragmentos caen y se posan en el suelo de la plaza; el acta aparece grabada en una placa de cerámica. |

Lo que se conserva tal cual: el guion, el director (`score.js`), los tiempos, la guía (botones y texto, que siguen en el plano del
muro), el sonido y la voz. Cambia el «cómo se ve» de cada universo.

## 5. Riesgos y decisiones

1. **Contrato del laboratorio.** Traer Three.js es posible (MIT, dentro de la carpeta con su licencia, sin CDN). Pero tres reglas del
   laboratorio están pensadas para piezas más pequeñas: «preferible cero dependencias», «WebGL2 es el camino de producción» y
   «nada de más de 20 MB» (una plaza capturada pesa 50–300 MB). Las tres son decisiones del estudio: hay que pedírselas a Beltrán.
2. **Tiempo.** Rehacer seis universos en 3D es más trabajo que el 2D actual. Propongo hacerlo por capas: primero la base técnica,
   después un universo de prueba, y de ahí el resto con agentes en paralelo.
3. **Contenido real.** Una plaza capturada exige ir a fotografiarla (un móvil y una aplicación de splats bastan) o generarla con IA
   a partir de fotos. Las figuras humanas pueden ser de Mixamo o generadas.
4. **La sala de verdad.** El 3D con varias cámaras sólo se puede juzgar en la sala: en el arnés se ve la tira plana. Hay que
   probarlo pronto en el motor real y en los muros.

## 6. Plan propuesto

1. **Base técnica (una pieza nueva, `res-3d`)**: Three.js r187 dentro del laboratorio; las cuatro cámaras *off-axis*; manos llevadas al
   plano del muro en el espacio 3D; post-proceso de cine; medir fps a 7196 × 912 y comprobar la costura P3 → P4.
2. **Un universo de prueba** que demuestre el salto: propongo **la intro en la plaza** (es la primera impresión y la que más gana en 3D).
3. Con el visto bueno, los demás universos en paralelo, uno por agente, sobre la misma base.

## Fuentes

- three.js: manual de WebGPURenderer y post-proceso: https://threejs.org/manual/en/webgpurenderer · https://threejs.org/manual/en/webgpu-postprocessing.html · versiones: https://github.com/mrdoob/three.js/releases
- three.js r186, splats nativos: https://radiancefields.com/three.js-ships-its-native-gaussian-splat-renderer-and-splat-raycasting-in-r186 · https://threejs.org/docs/pages/GaussianSplat.html
- Spark (World Labs): https://github.com/sparkjsdev/spark · https://www.worldlabs.ai/blog/spark-2.0
- Babylon.js 9: https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0
- Proyección CAVE (off-axis): https://www.evl.uic.edu/pape/caveproj/ · https://arxiv.org/pdf/2311.05887
- Electron, texturas compartidas: https://electronjs.org/docs/latest/api/shared-texture
- Partículas en GPU con three.js: https://discourse.threejs.org/t/gpu-driven-particle-system/94233
- Versiones y licencias comprobadas con `npm view` el 23-11-2026: three 0.187.0 (MIT), @sparkjsdev/spark 2.4.0 (MIT), babylonjs 9.37.2 (Apache-2.0), postprocessing 6.39.6 (Zlib).
