# Ressonància — 03 · Recursos técnicos (three r187 WebGPU/TSL, texto, librerías, ElevenLabs, Blender, oficio)

Fecha: 2026-11-24. Investigación web + inspección del `vendor/` de la obra
(`lab/experiments/ressonancia/vendor/three-r187/`, rama `lab-vicente`). No se ha tocado código.

**Cómo leer este documento.** Lo marcado **[verificado]** se ha comprobado esta noche contra el `vendor/` local o contra la
fuente oficial (ejemplos `r187` en GitHub, documentación de ElevenLabs). Lo marcado **[aprox.]** son tamaños o cifras
orientativas no medidas. Lo marcado **[sin verificar]** es conocimiento general que conviene probar antes de fiarse.

---

## 0. Qué hay ya en el `vendor/` (y qué falta)

**[verificado]** `vendor/three-r187/` pesa 8,3 MB: `build/three.core.js` (1,5 MB), `three.webgpu.js` (1,3 MB),
`three.tsl.js` (1,1 MB) y `jsm/` (4,5 MB, 270 archivos). La obra hoy sólo importa `three/webgpu`, `three/tsl`,
`addons/tsl/display/BloomNode.js` y `addons/loaders/HDRLoader.js`. El resto está copiado pero sin usar.

Ya disponible, sin copiar nada más:

- **Toda la cadena de post en TSL** (`jsm/tsl/display/`): Bloom, TRAA, TAAU, FXAA, SMAA, SSAA, DepthOfField, GTAO, SSAO, SSGI,
  SSR, SSS, Godrays, MotionBlur, Film, ChromaticAberration, RGBShift, Lensflare, lensDirt, Lut3D, Sharpen, FSR1, GaussianBlur,
  BilateralBlur, Denoise, RecurrentDenoise, TemporalReproject, AfterImage, Transition, radialBlur, hashBlur, boxBlur, BleachBypass,
  Sepia, CRT (incluye `vignette`), OITPass, Outline.
- **Utilidades TSL**: `tsl/math/curlNoise.js`, `voronoiNoise.js`, `Bayer.js`; `tsl/utils/Raymarching.js` (`RaymarchingBox`),
  `SoftParticles.js`, `RNoise.js`, `GroundedSkybox.js`.
- **Luz**: `lighting/ClusteredLighting.js`, `DynamicLighting.js`, `LightProbeGrid.js`, `LightMapper.js`, `lighting/vxgi/*`,
  `lights/SunLight*.js`, `RectAreaLightTexturesLib.js`, `csm/*`, `tsl/shadows/TileShadowNode.js`.
- **Cargadores**: `GLTFLoader`, `DRACOLoader`, `KTX2Loader`, `HDRLoader`, `EXRLoader`, `UltraHDRLoader`, `LUTCubeLoader`,
  `LUT3dlLoader`, `LUTImageLoader`, `FontLoader`, `TTFLoader`, `SVGLoader`, `IESLoader`.
- **Objetos y utilidades**: `objects/WaterMesh.js`, `Water2Mesh.js`, `SkyMesh.js`, `LensflareMesh.js`, `MarchingCubes.js`,
  `GaussianSplat.js`; `utils/BufferGeometryUtils.js`, `SkeletonUtils.js`, `MeshSurfaceSampler.js` (en `math/`),
  `modifiers/CurveModifierGPU.js`, `geometries/TextGeometry.js`, `RoundedBoxGeometry.js`, `misc/ProgressiveLightMapGPU.js`.
- **`libs/`**: sólo `meshopt_decoder.module.js`.

**Falta (los cargadores están, sus dependencias no)** — sin esto fallan al importar o al usar:

| Módulo que lo pide | Falta en `jsm/libs/` | Consecuencia |
|---|---|---|
| `KTX2Loader.js` | `ktx-parse.module.js`, `zstddec.module.js` + carpeta `basis/` (transcoder) | KTX2 no carga (ni siquiera importa) |
| `DRACOLoader.js` | carpeta `draco/gltf/` (decoder wasm) | Draco no decodifica |
| `EXRLoader`, `FBXLoader`, `USD*`, `3MF`, `KMZ`, `NRRD`… (9 imports) | `fflate.module.js` | Esos cargadores no importan |
| `TTFLoader.js` | `opentype.module.js` | `TextGeometry` desde `.ttf` no funciona |
| `helpers/RapierHelper.js` | `physics/RapierPhysics.js` (no copiado) | sin física |
| — | `jsm/controls/`, `jsm/postprocessing/` (WebGL antiguo) | no hacen falta |

**Nombres que cambian en r187 [verificado en el build local y en las notas de la versión]:**

- La clase de post es **`THREE.RenderPipeline`** (`PostProcessing` queda como alias obsoleto). La obra ya usa `RenderPipeline`.
- `ProxyNodeMaterial` → `NodeMaterialInstance`; `ViewportDepthNode.getProjectionDepth()` → `projectionDepth()`.
- `webgpu_gpudriven_*` → `webgpu_meshlets_*`. Nuevo: `lensDirt`, `webgpu_tsl_occlusion_dither`, `unwrapUVs`, `LightMapper` con
  horneado difuso, `BitonicSort` en una pasada, `compileAsync()` en paralelo, `emissiveNode` en Lambert/Phong/Toon.
- `setAnimationLoop(null)` ya no arranca el bucle interno; usar `count` y `dispatchSize` a la vez en un compute lanza error.
- **No existe `AnamorphicNode.js`** en r187: el anamórfico se construye con `bloom` + `highPassFn` + desenfoque horizontal
  (ejemplo `webgpu_postprocessing_anamorphic`).
- No existe `MeshTransmissionNodeMaterial`: la transmisión es `MeshPhysicalNodeMaterial` (`transmission`, `thickness`, `ior`,
  `dispersion`).

---

## 1. Capacidades de three r187 WebGPU/TSL y ejemplos oficiales que copiar

URL de cada ejemplo: `https://threejs.org/examples/<nombre>.html` · código:
`https://github.com/mrdoob/three.js/blob/r187/examples/<nombre>.html`. Lista **[verificada]** contra `examples/files.json` de r187.

### 1.1 Partículas y cómputo (storage buffers)

| Para | Ejemplo | Claves |
|---|---|---|
| Partículas instanciadas básicas | `webgpu_compute_particles` | `instancedArray(count,'vec3')`, `Fn(...)().compute(count)`, `SpriteNodeMaterial.positionNode = positions.toAttribute()`, `renderer.compute(node)` por frame. 200 000 partículas en el ejemplo |
| Lluvia / nieve con colisión por profundidad | `webgpu_compute_particles_rain`, `webgpu_compute_particles_snow` | cámara ortográfica de colisión, ripples |
| Fluido de partículas (MLS-MPM) | `webgpu_compute_particles_fluid` | el más caro; válido como referencia de rejilla 3D |
| Atractores, partículas enlazadas | `webgpu_tsl_compute_attractors_particles`, `webgpu_tsl_vfx_linkedparticles` | muy adecuado para «brasa», chispas y polvo que siguen a la mano |
| Bandada | `webgpu_compute_birds` | flocking en GPU con geometría instanciada y aleteo en vértice |
| Tela | `webgpu_compute_cloth` | verlet en compute (banderas, telas de fiesta) |
| Agua con altura | `webgpu_compute_water`, `webgpu_water`, `webgpu_backdrop_water`, `webgpu_ocean` | ondas por toque: es el patrón «mano = gota» |
| Textura ping-pong / 3D | `webgpu_compute_texture_pingpong`, `webgpu_compute_texture_3d`, `webgpu_compute_texture` | simulaciones 2D (reacción-difusión, fluido stam) a fracción de resolución |
| Geometría deformada en compute | `webgpu_compute_geometry`, `webgpu_skinning_points` | puntos sobre un personaje animado |
| Galaxia, tornado, llamas, mar | `webgpu_tsl_galaxy`, `webgpu_tsl_vfx_tornado`, `webgpu_tsl_vfx_flames`, `webgpu_tsl_raging_sea` | VFX procedurales sin texturas |
| Partículas suaves | `webgpu_particles`, `webgpu_particles_soft` | `SoftParticles.js` evita el corte contra la geometría |

Patrón mínimo **[verificado]**:

```js
import { Fn, instancedArray, instanceIndex, hash, uniform } from 'three/tsl';
const pos = instancedArray(COUNT, 'vec3'), vel = instancedArray(COUNT, 'vec3');
const init   = Fn(() => { pos.element(instanceIndex).assign(/* … */); })().compute(COUNT);
const update = Fn(() => { /* vel += fuerzas · dt ; pos += vel · dt */ })().compute(COUNT);
renderer.compute(init);                       // una vez
const m = new THREE.SpriteNodeMaterial({ blending: THREE.AdditiveBlending, depthWrite: false });
m.positionNode = pos.toAttribute();
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); mesh.count = COUNT;
// cada frame: renderer.compute(update); pipeline.render();
```

Atención con dos instancias de la página (sala + visor): cada una crea su dispositivo y sus buffers. El visor debe usar un
`COUNT` reducido (parámetro `quality` o `vt.sink === 'viewer'`).

### 1.2 Cadena de post (firmas **verificadas** en `vendor/…/jsm/tsl/display/`)

| Efecto | Import (`three/addons/tsl/display/…`) | Firma | Ejemplo |
|---|---|---|---|
| Bloom | `BloomNode.js` | `bloom(node, strength, radius, threshold)`; `.setResolutionScale(0.25)`; `.highPassFn` | `webgpu_postprocessing_bloom`, `_bloom_emissive`, `_bloom_selective` |
| Anamórfico | (bloom + blur horizontal) | ver ejemplo | `webgpu_postprocessing_anamorphic` |
| TRAA | `TRAANode.js` | `traa(color, depth, velocity, camera)`; exige MRT `{ output, velocity }` | `webgpu_postprocessing_traa` |
| TAAU (TAA + upscaling) | `TAAUNode.js` | `taau(color, depth, velocity, camera)` | `webgpu_upscaling_taau` |
| FSR1 / Sharpen | `FSR1Node.js`, `SharpenNode.js` | `fsr1(node, sharpness, denoise)`, `sharpen(node, sharpness, denoise)` | `webgpu_upscaling_fsr1` |
| FXAA / SMAA | `FXAANode.js`, `SMAANode.js` | `fxaa(node)`, `smaa(node)` | `webgpu_postprocessing_fxaa`, `_smaa` |
| DOF | `DepthOfFieldNode.js` | `dof(node, viewZ, focusDistance, focalLength, bokehScale)` | `webgpu_postprocessing_dof`, `_dof_basic` |
| AO (GTAO) | `GTAONode.js` | `ao(depth, normal, camera)`; `.resolutionScale` | `webgpu_postprocessing_ao` |
| SSGI | `SSGINode.js` | `ssgi(beauty, depth, normal, camera)` | `webgpu_postprocessing_ssgi`, `_ssgi_ballpool` |
| SSR | `SSRNode.js` | `ssr(color, depth, normal, options)` | `webgpu_postprocessing_ssr`, `_ssr_denoise` |
| Sombras de contacto en pantalla | `SSSNode.js` | `sss(depth, camera, mainLight)` | `webgpu_postprocessing_sss`, `webgpu_shadow_contact` |
| Motion blur | `MotionBlur.js` | `motionBlur(input, velocity, numSamples = 16)` | `webgpu_postprocessing_motion_blur` |
| Grano | `FilmNode.js` | `film(input, intensity, uv)` | `webgpu_postprocessing` |
| Aberración cromática | `ChromaticAberrationNode.js` | `chromaticAberration(node, strength = 1, center = null, scale = 1.1)` | `webgpu_postprocessing_ca` |
| Lens flare / suciedad | `LensflareNode.js`, `lensDirt.js` | `lensflare(node, params)`, `lensDirt(tex, dirtTex, intensity)` | `webgpu_postprocessing_lensflare` |
| Godrays | `GodraysNode.js` | `godrays(depth, camera, light)` | `webgpu_postprocessing_godrays` |
| LUT 3D | `Lut3DNode.js` + `loaders/LUTCubeLoader.js` | `lut3D(node, lutTexture3D, size, intensity)` | `webgpu_postprocessing_3dlut` |
| Estelas | `AfterImageNode.js` | `afterImage(node, damp)` | `webgpu_postprocessing_afterimage` |
| Transición entre mundos | `TransitionNode.js` | `transition(a, b, mixTex, ratio, threshold, useTexture)` | `webgpu_postprocessing_transition` |
| Viñeta, scanlines | `CRT.js` | `vignette(color, intensity, smoothness, coord)` | `webgpu_postprocessing_retro` |
| Etalonaje sin LUT | `three/tsl` | `hue`, `saturation`, `vibrance`, `posterize` | `webgpu_color_grading`, `webgpu_tonemapping` |

**Tone mapping.** `THREE.AgXToneMapping` y `THREE.NeutralToneMapping` están en el build **[verificado]**. La obra usa
`ACESFilmicToneMapping`. Para una sala oscura con emisivos saturados (brasa, fuego) **AgX** desatura hacia blanco con más
elegancia y no «quema» el naranja en amarillo; **Neutral** conserva el tono exacto de marca. Recomendación: probar AgX con
`exposure` +0,3 EV y una curva de contraste propia después. Es un cambio de una línea.

Esqueleto de cadena completa **[verificado: patrón del ejemplo TRAA + firmas locales]**:

```js
import { pass, mrt, output, velocity, emissive } from 'three/tsl';
const scenePass = pass(scene, camera);
scenePass.setMRT(mrt({ output, velocity /*, emissive */ }));
const color = scenePass.getTextureNode('output');
const depth = scenePass.getTextureNode('depth');
const vel   = scenePass.getTextureNode('velocity');
const aa    = traa(color, depth, vel, camera);
const bl    = bloom(aa, 0.6, 0.8, 0.9); bl.setResolutionScale(0.25);
pipeline.outputNode = film(aa.add(bl), 0.25);
```

**Dos avisos propios de esta obra:**

1. **Varias cámaras por tira.** `room3d.js` dibuja la tira con vistas por muro. `traa`, `ao`, `ssgi`, `dof`, `godrays` y `sss`
   reciben **una** cámara: no encajan tal cual con un render multivista. O se aplican por muro (cuatro `pass`, caro), o se limita
   el post a efectos de imagen pura (bloom, grano, LUT, afterImage, sharpen, blur), que no necesitan cámara. **[sin verificar]** el
   comportamiento de TRAA con `ArrayCamera`.
2. **Costura P3→P4.** Los desenfoques de pantalla (bloom, gaussian, DOF, radial) muestrean con *clamp* en el borde de la tira: un
   brillo junto a x = 0 no sangra a x = W y se ve un corte de halo. Soluciones: (a) renderizar con un margen duplicado de N px a
   cada lado y recortar; (b) hacer el desenfoque propio con `fract()` en la coordenada x. `chromaticAberration` y `radialBlur`
   tienen un centro: en una tira de 360° no hay centro; evítalos o aplícalos por muro con muy poca intensidad. El grano debe
   depender de la coordenada de píxel, no de `uv` de la tira estirada.

**Coste a 7196 × 912 (6,56 Mpx ≈ 3,2 × 1080p) [aprox.]:** bloom a 0,25 es barato; GTAO a 0,5 asumible; SSGI y SSR a resolución
completa no caben en 6 ms con la GPU compartida (usar 0,5 o descartar); TRAA añade un MRT de velocidad a tamaño completo. Medir
siempre con `?scale=1`.

### 1.3 Luz volumétrica y niebla

| Para | Ejemplo | Notas |
|---|---|---|
| Luz volumétrica real | `webgpu_volume_lighting`, `_rectarea`, `_traa` | `VolumeNodeMaterial` (`steps = 12`, `offsetNode = bayer16(screenCoordinate)`, `scatteringNode`), capa propia, `volumetricPass.setResolutionScale(0.25)` + `gaussianBlur` como denoise **[verificado]** |
| Nube / fuego / perlin volumétrico | `webgpu_volume_cloud`, `webgpu_volume_fire`, `webgpu_volume_perlin` | `RaymarchingBox(steps, cb)` de `tsl/utils/Raymarching.js` |
| Cáusticas | `webgpu_caustics`, `webgpu_volume_caustics` | luz a través de cristal o agua |
| Niebla | `webgpu_custom_fog`, `webgpu_custom_fog_background`, `webgpu_custom_fog_scattering`, `webgpu_fog_height`, `webgpu_postprocessing_fog` | niebla de altura y con dispersión: es la más rentable para dar profundidad |
| Godrays en pantalla | `webgpu_postprocessing_godrays` | una luz, una cámara |

La volumétrica a 0,25 con dither Bayer es el efecto «caro que parece caro» que mejor relación tiene para una sala oscura. La
textura 3D de ruido se genera al arrancar (`Data3DTexture` 64³–128³): para 360° hay que generarla **teselable** (ruido periódico).

### 1.4 Materiales: vidrio, piel, agua

- Transmisión/cristal: `webgpu_materials_transmission`, `webgpu_loader_gltf_transmission`, `webgpu_loader_gltf_dispersion`,
  `webgpu_backdrop`, `webgpu_backdrop_area`, `webgpu_refraction`. La transmisión dispara un pase extra de la escena: muy caro a
  7196 px. Alternativa barata: `viewportSharedTexture` + desplazamiento por normal (patrón `webgpu_backdrop`).
- SSS: `webgpu_materials_sss` (`MeshSSSNodeMaterial`, en el build). Retrorreflexión: `webgpu_materials_retroreflection`.
- Reflejos: `webgpu_reflection`, `webgpu_reflection_blurred`, `webgpu_reflection_roughness`, `webgpu_mirror` (suelo mojado).
- Madera, terreno, halftone procedurales: `webgpu_tsl_wood`, `webgpu_tsl_procedural_terrain`, `webgpu_tsl_halftone`,
  `webgpu_procedural_texture`. Ruido MaterialX: `webgpu_materialx_noise` (`mx_noise_float`, `mx_fractal_noise_vec3`,
  `mx_worley_noise_float` están en `three/tsl` **[verificado]**, igual que `triNoise3D`).

### 1.5 SDF y raymarching en TSL

- `webgpu_volume_*` (raymarching de volumen), `webgpu_shadertoy` (transpila GLSL de Shadertoy a TSL), `webgpu_tsl_transpiler`,
  `webgpu_tsl_interoperability` (WGSL/GLSL nativo dentro de TSL con `wgslFn`), `webgpu_tsl_angular_slicing`.
- Un SDF a pantalla completa de 6,5 Mpx con 64 pasos no cabe en presupuesto: renderízalo a 0,33–0,5 (`rtt()` o un `pass` con
  `setResolutionScale`) y súbelo con `sharpen`/`fsr1`.

### 1.6 Instancias con animación por instancia; personajes

| Para | Ejemplo |
|---|---|
| Malla instanciada, uniformes por instancia | `webgpu_instance_mesh`, `webgpu_instance_uniform`, `webgpu_materials_node_instance` |
| Instancias a lo largo de una curva | `webgpu_instance_path`, `webgpu_modifier_curve` |
| Sprites y puntos instanciados | `webgpu_instance_sprites`, `webgpu_instance_points`, `webgpu_sprites` |
| **Morph por instancia** | `webgpu_instancing_morph` |
| **Skinning instanciado** (multitud) | `webgpu_skinning_instancing`, `webgpu_skinning_instancing_individual` (cada instancia con su tiempo de animación) |
| Skinning, morph, caras | `webgpu_skinning`, `webgpu_morphtargets`, `webgpu_morphtargets_face`, `webgpu_animation_retargeting` |
| `BatchedMesh` | `webgpu_mesh_batch`, `webgpu_performance`, `webgpu_performance_renderbundle` |
| Muchas luces | `webgpu_lights_clustered`, `webgpu_lights_dynamic`, `webgpu_lights_selective`, `webgpu_lights_projector`, `webgpu_lights_ies_spotlight` |

Para la *pinya* y el *castell* (muchas figuras humanas lentas), `webgpu_skinning_instancing_individual` es el ejemplo directo:
una malla con esqueleto, N instancias, desfase de animación por instancia. Animación por instancia sin esqueleto: `instanceIndex`
+ `hash(instanceIndex)` en `positionNode` (cero coste de CPU).

### 1.7 Iluminación horneada y GI dentro de three

- `webgpu_lightmap_baking` (`LightMapper.js`, nuevo horneado difuso), `webgpu_shadowmap_progressive`
  (`ProgressiveLightMapGPU.js`), `webgpu_unwrap` (`unwrapUVs`), `webgpu_lightprobes*` (`LightProbeGrid`), `webgpu_vxgi*`.
- Permiten hornear AO/luz **al arrancar** en la propia GPU de la sala, sin pasar por Blender. Son piezas recientes
  **[sin verificar]** en estabilidad; para esta noche es más seguro hornear en Blender (§5).

---

## 2. Texto en three WebGPU

**Estado de la obra [verificado]:** `scenes3d/typo3d.js` ya implementa tipografía SDF propia (atlas generado al cargar desde
canvas con transformada de distancia euclídea, método de tiny-sdf), con materiales TSL (WebGPU y WebGL2), instancias por glifo en
rejilla de 4 × 4 teselas, animaciones de llegada, barrido de luz, salida y revelado por desenfoque palabra a palabra. Fuentes
OFL autoalojadas: Instrument Serif, Geist, Geist Mono.

| Opción | WebGPU/TSL | Licencia | Valoración |
|---|---|---|---|
| **SDF propio (`typo3d.js`)** | Sí (ya funciona) | propio | Cero dependencias, animación por tesela. Límite del SDF de un canal: esquinas redondeadas a gran tamaño |
| **three-msdf-text-utils 1.5.0** | Sí: `MSDFTextNodeMaterial` desde `three-msdf-text-utils/webgpu`; exige three ≥ 0.178 **[verificado]** | ISC; dependencias `comlink` (Apache-2.0), `quad-indices`, `word-wrapper` (MIT) | La mejor librería externa. Atributos `letterIndex`, `wordIndex`, `lineIndex`, `layoutUv`, `glyphUv`. Atlas pregenerado (`.fnt` + PNG con `msdf-bmfont-xml`) o en ejecución (`generateMSDF`, necesita `worker.bundled.js` + `msdfgen.wasm`) |
| troika-three-text | **No fiable**: construye `ShaderMaterial` derivados; hay informes de cuadrado blanco con WebGPURenderer y el tutorial de Codrops (Gommage) la descartó por incompatibilidad con WebGPU/TSL. No encontré anuncio de soporte oficial | MIT | Descartada para esta obra |
| `TextGeometry` + TSL | Sí | MIT | Sólo para títulos con volumen real (extrusión, bisel, luz). Necesita fuente `typeface.json` (o `TTFLoader` + `opentype.module.js`, que falta). Muchos triángulos; no para subtítulos |
| Textura de canvas | Sí (`CanvasTexture`) | — | Tipografía perfecta del sistema (kerning, ligaduras, acentos catalanes, `l·l`). No escala ni se anima por letra; válida para subtítulos a tamaño fijo |

**Recomendación para subtítulos y títulos en la sala 360°:**

1. **Mantener `typo3d.js`** como sistema único: ya es SDF, TSL y sin costura. No vendorizar una librería de texto esta noche.
2. Si los títulos grandes (> 40 cm de altura de mayúscula) muestran esquinas blandas, subir la resolución del atlas para la serif
   (glifo a 96–128 px con *spread* de 12–16 px) antes que migrar a MSDF. Migrar a MSDF sólo si aun así no basta; en ese caso
   pregenerar el atlas fuera de línea y usar sólo el *shader* de mediana de tres canales, no la librería entera.
3. **Subtítulos** (voz en off): una línea, máx. ~42 caracteres, repetida **en cada muro** (el visitante mira a cualquier lado),
   con el centro de la línea a **1,5–1,7 m** del suelo si son lectura principal o a **1,0–1,2 m** si acompañan a una imagen
   superior; altura de mayúscula ≥ 6–7 cm (legible a 4–5 m); Geist 500, blanco al 85–90 %, nunca blanco puro; entrada por
   desenfoque (la que ya existe, 0,75 s) y permanencia ≥ 1,5 s + 60 ms por carácter. Sin placa negra opaca: un oscurecimiento
   suave del fondo detrás (gaussiana ancha al 30–40 %).
4. Títulos de capítulo: Instrument Serif, tracking amplio, uno por muro o uno que recorre el perímetro; nunca cruzar una esquina
   por dentro de una palabra.
5. El suavizado del SDF debe usar la derivada de pantalla (`fwidth`) para que el borde mida ~1 px a cualquier escala de render
   (0,25–1), incluida la instancia del visor.

---

## 3. Librerías que merece la pena vendorizar

| Librería | Licencia | Tamaño | WebGPU | Origen | ¿Esta noche? |
|---|---|---|---|---|---|
| `libs/draco/gltf/` (`draco_decoder.wasm`, `draco_wasm_wrapper.js`) | Apache-2.0 | ~250 KB [aprox.] | indiferente (CPU/wasm) | `three@0.187/examples/jsm/libs/draco/gltf/` | Sólo si se exporta con Draco. Preferible meshopt, que ya está |
| `libs/meshopt_decoder.module.js` | MIT | ya está | sí | — | **Ya disponible**: `gltfLoader.setMeshoptDecoder(MeshoptDecoder)` |
| `libs/basis/` (`basis_transcoder.js` + `.wasm`) | Apache-2.0 | ~600 KB [aprox.] | sí (`ktx2Loader.detectSupport(renderer)`) | `three@0.187/examples/jsm/libs/basis/` | **Sí**, si hay texturas > 1k |
| `libs/ktx-parse.module.js`, `libs/zstddec.module.js` | MIT (zstd: BSD) | ~80 KB [aprox.] | sí | ídem `libs/` | **Sí**, junto con basis (KTX2Loader no importa sin ellos) |
| `libs/fflate.module.js` | MIT | ~70 KB [aprox.] | — | ídem | Sí si se usa `EXRLoader` |
| `libs/opentype.module.js` | MIT | ~170 KB [aprox.] | — | ídem | Sólo si se usa `TTFLoader` + `TextGeometry` |
| `@dimforge/rapier3d-compat` 0.21.0 (`rapier.mjs`, wasm embebido en base64) + `physics/RapierPhysics.js` | Apache-2.0 | ~2 MB [aprox.] | indiferente | npm; el addon de three apunta a jsDelivr **[verificado]**: hay que cambiar `RAPIER_PATH` a ruta local | No, salvo que una escena necesite colisiones rígidas reales. La versión `-compat` funciona sin red (no hace `fetch` del wasm) |
| three-msdf-text-utils 1.5.0 | ISC | decenas de KB [aprox.] | sí | npm | No (ver §2) |
| HDRI Poly Haven | CC0 | 1k `.hdr` ≈ 1,5 MB c/u | sí (`HDRLoader`) | polyhaven.com | Ya hay dos (`rooftop_night_1k`, `kloppenheim_07_puresky_1k`). Añadir sólo si una escena lo pide |
| Texturas PBR Poly Haven / ambientCG | CC0 | 1k JPG ≈ 1–3 MB por material | sí | polyhaven.com, ambientcg.com | Ya hay 11 materiales en `assets/cc0`. Convertir a KTX2 si pesa la VRAM |
| LUT `.cube` propias | propias | 33³ ≈ 1 MB texto | sí (`LUTCubeLoader` + `lut3D`) | exportadas de DaVinci/Blender | Opcional; el etalonaje por nodos (`saturation`, curvas) es suficiente |
| glTF-Transform CLI, `gltfpack`, `toktx`/`basisu` | MIT / MIT / Apache-2.0 | herramientas de desarrollo | — | npm, meshoptimizer, KTX-Software | Se usan **fuera** de la obra para preparar assets; no se vendorizan |

**Descartadas:** `postprocessing` (pmndrs) y `realism-effects` son para `WebGLRenderer` y `EffectComposer`: no funcionan con
`WebGPURenderer`; todo lo que ofrecen ya está en `tsl/display`. `lil-gui` no hace falta (los parámetros van por manifiesto).
`three-mesh-bvh` (MIT) sólo si se necesita raycast masivo en CPU. troika (§2).

**Ruido:** no hace falta ninguna librería. En `three/tsl`: `mx_noise_float/vec3`, `mx_fractal_noise_*`, `mx_worley_noise_*`,
`mx_cell_noise_float`, `triNoise3D`, `hash`. En addons: `curlNoise`, `snoise`, `voronoi2d/3d`. Para continuidad 360°, muestrear
el ruido sobre un cilindro (`vec3(cos θ · R, y, sin θ · R)`), como ya hace la plantilla del laboratorio.

**Importmap:** todos los addons importan `'three'`, `'three/webgpu'` o `'three/tsl'`; el importmap de `index.html` debe seguir
resolviendo los tres a `vendor/three-r187/build/`. Los `.wasm` se sirven desde la misma carpeta (`setTranscoderPath`,
`setDecoderPath` con rutas relativas a la página, no absolutas).

---

## 4. ElevenLabs API (sin SDK, con `fetch` de Node)

Todo lo siguiente está **[verificado]** contra `elevenlabs.io/docs` hoy, salvo donde se indica. La clave se lee de archivo y
**nunca** se imprime ni se commitea. Las generaciones son un paso **fuera de línea**: la obra sólo reproduce archivos locales.

> **Regla del proyecto.** El contrato dice «sólo síntesis Web Audio propia, sin samples», con una **excepción aprobada por el
> director (2026-11-24) para Ressonància**: samples mp3 propios (voces y stems, ~22 MB) y texto/voz en español (inglés en el
> selector de voz). La excepción nombra español e inglés: una voz en **catalán** y un aumento notable de peso sobre esos ~22 MB
> quedan fuera de lo escrito y conviene confirmarlos. Comprobar también que el plan contratado incluye licencia comercial (los planes de pago la incluyen; el gratuito
> exige atribución) **[sin verificar para la cuenta concreta]**.

### 4.1 Modelos

| Uso | `model_id` | Castellano | Catalán | Límite por petición | Nota |
|---|---|---|---|---|---|
| Voz, máxima calidad | `eleven_v4` | sí | **sí** | 100 000 caracteres | modelo insignia actual; clones, diálogo |
| Voz expresiva | `eleven_v3` | sí | **sí** | 5 000 | etiquetas de audio (`[whispers]`, `[sighs]`), muy dramática, menos estable |
| Voz estable larga | `eleven_multilingual_v2` | sí | **no** | 10 000 | la más predecible; no admite `language_code` |
| Rápida/barata | `eleven_flash_v2_5` | sí | no (según la tabla) | 40 000 | para borradores de ritmo |
| Efectos | `eleven_text_to_sound_v3` | — | — | 0,5–30 s | admite `loop`; el v2 se retira el 2027-03-01 |
| Música | `music_v2_5` (anterior `music_v2`, por defecto `music_v1`) | — | — | 3 s – 10 min | planes de composición por secciones |

Para **catalán** sólo sirven `eleven_v4` y `eleven_v3` (enviar `language_code: "ca"`; para castellano `"es"`). Elegir una voz
cuya ficha `verified_languages` incluya el idioma o probar varias: el acento depende de la voz.

### 4.2 Endpoints

| Qué | Método y ruta | Cuerpo principal |
|---|---|---|
| Listar voces | `GET /v2/voices?search=&language=&category=&page_size=100` | devuelve `voice_id`, `name`, `labels`, `verified_languages[]`, `preview_url` |
| Listar modelos | `GET /v1/models` | comprobar `can_do_text_to_speech` |
| Voz | `POST /v1/text-to-speech/{voice_id}?output_format=…` | `text`, `model_id`, `language_code`, `voice_settings { stability, similarity_boost, style, use_speaker_boost, speed }`, `seed`, `previous_text`, `next_text`, `previous_request_ids` (máx. 3), `apply_text_normalization` |
| Efectos | `POST /v1/sound-generation?output_format=…` | `text`, `duration_seconds` (0,5–30 o `null`), `prompt_influence` (0–1, por defecto 0,3), `loop`, `model_id` |
| Música | `POST /v1/music?output_format=…` | `prompt` + `music_length_ms` (3000–600000) + `force_instrumental`, **o** `composition_plan`; `model_id`, `seed` (no con `prompt`) |

Base: `https://api.elevenlabs.io` (residencia UE: `https://api.eu.residency.elevenlabs.io`). Cabeceras: `xi-api-key`,
`Content-Type: application/json`. Respuesta 200 = el archivo de audio binario; 422 = error de validación con `detail[]`.

**Formatos (`output_format`)**: `mp3_44100_128` (por defecto), `mp3_44100_192` (plan Creator o superior), `opus_48000_32…192`,
`pcm_8000…48000` (PCM crudo s16le mono, sin cabecera), `wav_8000…48000`. PCM/WAV a 44,1 kHz exigen plan Pro o superior; para
48 kHz la página no declara nivel **[sin verificar: probar]**. La música usa por defecto `auto` = `mp3_48000_192` en los modelos v2.

**Recomendación de formato.** El `AudioContext` de la sala es de 48 kHz. Pedir `wav_48000` (o `pcm_48000` y añadir cabecera); si
el plan lo rechaza, `mp3_44100_192`. Guardar el máster y convertir fuera de línea si hace falta. Chromium decodifica WAV, MP3 y
Opus con `decodeAudioData`. La voz sale **mono**: se coloca en el muro con `audio.wallInput()`.

**Límites.** La limitación es por **concurrencia**, no por minuto: Free 2, Starter 3, Creator 5, Pro 10 peticiones simultáneas en
modelos no Flash (el doble en Flash). Cabeceras de respuesta `current-concurrent-requests` y `maximum-concurrent-requests`.
Lanzar en serie o con concurrencia 2 y reintentar ante 429 con espera creciente. El coste va por caracteres (voz) y por duración
(efectos, música) **[tarifas sin verificar]**.

**Continuidad entre frases.** Generar una frase por petición (permite sincronizar subtítulos con exactitud y regenerar una sola)
pasando `previous_text`/`next_text` o `previous_request_ids` para que la prosodia enlace. Fijar `seed` y guardar el `request-id`
de la cabecera de respuesta. `stability` 0,4–0,55 y `style` 0–0,2 para una narración contenida; `speed` 0,9–0,95 para sala.

### 4.3 Script de Node (sin SDK, Node ≥ 18)

```js
// tools/eleven.mjs — uso: node eleven.mjs   (la clave se lee de archivo; nunca se imprime)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const KEY = (await readFile(process.env.ELEVEN_KEY_FILE, 'utf8')).trim();
const API = 'https://api.elevenlabs.io';

async function call(path, body, { query = '', tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${API}${path}${query}`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()), id: r.headers.get('request-id') };
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * 2 ** i)); continue; }
    throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 400)}`);     // el cuerpo de error no contiene la clave
  }
  throw new Error(`${path}: sin éxito tras ${tries} intentos`);
}

export const tts = (voiceId, text, o = {}) => call(`/v1/text-to-speech/${voiceId}`, {
  text, model_id: o.model ?? 'eleven_v3', language_code: o.lang ?? 'ca', seed: o.seed ?? 7,
  previous_text: o.prev, next_text: o.next,
  voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true, speed: 0.93, ...o.voice },
}, { query: `?output_format=${o.format ?? 'wav_48000'}` });

export const sfx = (text, o = {}) => call('/v1/sound-generation', {
  text, duration_seconds: o.seconds ?? null, prompt_influence: o.influence ?? 0.4, loop: !!o.loop,
  model_id: 'eleven_text_to_sound_v3',
}, { query: `?output_format=${o.format ?? 'wav_48000'}` });

export const music = (prompt, ms, o = {}) => call('/v1/music', {
  prompt, music_length_ms: ms, model_id: o.model ?? 'music_v2_5', force_instrumental: o.instrumental ?? true,
}, { query: `?output_format=${o.format ?? 'mp3_48000_192'}` });

// ejemplo
await mkdir('out', { recursive: true });
const a = await tts(process.env.VOICE_ID, 'La plaça respira abans que ningú pugi.', { lang: 'ca' });
await writeFile('out/vo-001.wav', a.buf);
```

Listar voces: `fetch(API + '/v2/voices?page_size=100&search=catalan', { headers: { 'xi-api-key': KEY } })`. No registrar
cabeceras de la petición, no pasar la clave por línea de comandos ni por URL, y dejar el archivo de la clave fuera del repo.

**Tamaño de los medios.** WAV mono 48 kHz 16 bit = 96 KB/s (5,8 MB/min); un tema de 5 min en MP3 192 kbps ≈ 7 MB. El límite del
repositorio es 20 MB por archivo: partir la música por capítulos o guardarla en el Drive del estudio.

---

## 5. Blender → web

### 5.1 Exportación glTF (`File › Export › glTF 2.0`, o `bpy.ops.export_scene.gltf`)

- Formato **GLB**. `+Y Up` activado. Aplicar transformaciones (`Ctrl+A`) y modificadores antes; escala 1 = 1 m (la sala trabaja en
  metros reales).
- Malla: UV, normales, **tangentes sólo si hay mapa de normales**; colores de vértice sólo si se usan (sirven para AO horneado
  barato). Desactivar cámaras y luces puntuales salvo que se quieran (las luces se diseñan en three).
- Materiales: Principled BSDF → PBR metal-rough. Lo procedural **no** se exporta: hay que hornearlo a textura. Empaquetar
  oclusión/rugosidad/metal en un solo ORM (canales R/G/B). Imágenes: exportar en JPEG/PNG y comprimir después.
- Animación: muestrear (`Sampling Rate` 1–2), «Optimize Animation Size» activado, una acción por clip mediante pistas NLA,
  huesos de deformación únicamente. Morph targets sin normales si no hacen falta (reduce mucho).
- **Compresión**: **no** activar Draco en el exportador; comprimir después con glTF-Transform (MIT):

```
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2 --texture-size 2048
```

  `meshopt` descomprime más rápido que Draco, admite animación y morphs, y su decodificador ya está en el `vendor/`.
  Carga: `new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2.detectSupport(renderer))`. Con WebGPURenderer,
  `detectSupport` debe llamarse **después** de `await renderer.init()`.
- Texturas KTX2: **UASTC** para normales y máscaras, **ETC1S** para color (mucho más pequeño). En las GPU de la sala se
  transcodifican a BC7/BC1–3: una textura 2k ocupa ~5 MB de VRAM con mipmaps frente a ~21 MB en RGBA8.

### 5.2 Horneado de AO y luz

- Cycles, `Bake Type`: **Ambient Occlusion** (rápido) o **Diffuse** con sólo *Direct + Indirect* y sin *Color* (mapa de luz
  puro). 64–256 muestras + denoise. `Margin` 8–16 px. Segundo canal UV (`UV1`) sin solapes (Smart UV Project o Lightmap Pack,
  margen 0,02–0,05).
- En glTF el AO usa el **segundo UV** (`TEXCOORD_1`) y el canal R de la textura de oclusión; three lo aplica en `aoMap`. Para un
  mapa de luz completo: `material.lightMap` + `lightMapIntensity` (también `UV1`), asignado a mano tras cargar.
- Resolución: 1024² por objeto principal o un atlas 2048² por escena; a 261 px/m en el muro, 1 texel de lightmap cada 1–2 cm
  es suficiente (la luz horneada es de baja frecuencia).
- Alternativa más barata: hornear AO a **color de vértice** (`COLOR_0`) en mallas densas; cero texturas.
- Coherencia: hornear con el mismo HDRI que la obra usa de entorno, o con luz neutra y teñir en *shader*.

### 5.3 Presupuesto para 60 fps a 7196 × 912 [aprox.]

El coste dominante en esta resolución es el **relleno de píxel**, no la geometría.

| Recurso | Objetivo |
|---|---|
| Triángulos visibles | ≤ 1,5–2 M en total (se dibujan una vez por vista de muro: contar × 4 si no hay culling por vista) |
| Llamadas de dibujo | ≤ 200–300 por vista; instanciar o `BatchedMesh` todo lo repetido |
| Texturas | 1k–2k por material, KTX2; VRAM total de la obra ≤ 1–1,5 GB (la sala comparte GPU con clips HAP y el visor) |
| Sombras | 1–2 luces con mapa de sombra (2048²); el resto horneado. Cada sombra es otro pase de geometría |
| Transparencias | lo mínimo; partículas aditivas pequeñas. El *overdraw* a 6,5 Mpx es lo que rompe los 6 ms |
| Luces dinámicas | pocas y con alcance corto, o `ClusteredLighting` |
| Personajes con esqueleto | ≤ 60 huesos, ≤ 10–15 k triángulos; multitudes con skinning instanciado |
| GLB por escena | ≤ 10–20 MB (el límite del repo es 20 MB por archivo) |
| Arranque | `await renderer.compileAsync(scene, camera)` antes de mostrar cada mundo: sin tirones al cambiar de capítulo |

---

## 6. Oficio: qué hacen los estudios de referencia y qué aplica a una sala oscura, lenta y grande

Fuentes: charlas y *case studies* públicos de Active Theory, Lusion, Resn, Immersive Garden, Bruno Simon y artículos de
Codrops/Awwwards. Es síntesis de práctica conocida, **no** citas literales; sirve como lista de decisiones.

### 6.1 Luz

- **Una luz protagonista por escena**, con dirección clara; el resto son rellenos muy bajos. La oscuridad es el material: 70–85 %
  de la tira por debajo del 10 % de luminancia.
- **Luz cálida de práctica + ambiente frío** (brasa 1800–2400 K contra azul noche): el contraste de temperatura da volumen sin
  subir la exposición.
- **Contraluz y borde** (*rim*) antes que luz frontal: las siluetas se leen a 6 m; el detalle frontal no.
- **Horneado + una luz viva.** Los estudios hornean casi todo (Bruno Simon, Immersive Garden) y dejan dinámica sólo la luz que
  responde al usuario. Aquí: «la mano es una linterna» como única luz dinámica real.
- **Niebla de altura y volumétrica a baja resolución** para separar planos; sin atmósfera, una escena 3D proyectada se lee plana.
- La sala proyecta sobre los cuatro muros: **la imagen ilumina la sala y lava el muro opuesto**. Media de luminancia baja
  (≤ 15–20 %) o el negro se pierde. Nunca fundidos a blanco completo.

### 6.2 Color y etalonaje

- Paleta de **dos tonos y un acento** por capítulo; saturación alta sólo en el acento emisivo.
- **Tone mapping AgX o Neutral** + curva suave propia; negros **levantados apenas** (1–2 %) con un tinte frío, altas luces con
  tinte cálido (*split toning*). Un LUT por capítulo y `lut3D(…, intensity)` interpolado en las transiciones.
- **Dither/grano en la salida**: con degradados oscuros en 8 bits el *banding* es el defecto más visible en proyección. Grano
  proporcional a la luminancia (ya lo hace `room3d.js`), animado a 12–24 Hz, no a 60, y de tamaño ≥ 2 px a escala 1.
- El proyector no da negro: comprobar los grises 2–8 % en la sala real; lo que en monitor es «negro elegante» puede ser gris plano.

### 6.3 Profundidad

- **Paralaje lento** con tres planos (cerca, medio, fondo) y niebla entre ellos. En una sala sin *head tracking* la profundidad
  la dan el movimiento relativo y la atmósfera, no la perspectiva.
- **DOF con mesura**: sólo como transición de enfoque (rack focus de 1–2 s); un fondo siempre borroso a escala 1:1 parece
  defecto de proyector.
- Partículas de polvo muy pequeñas y lentas en primer plano (soft particles) dan escala humana.
- **Bloom ancho y débil** (radio alto, fuerza 0,3–0,6, umbral alto, sólo emisivos vía MRT `emissive`): un halo fino lee como
  «videojuego»; uno ancho, como óptica.
- Reflejo borroso en el suelo (`webgpu_reflection_blurred`) ancla los objetos.

### 6.4 Tiempo y movimiento

- **Curvas asimétricas**: entrada rápida y salida muy larga (easeOutExpo/Quint, 0,8–2,5 s); nada lineal. Respuesta a la mano
  < 100 ms con un gesto pequeño, y un eco lento de 2–6 s.
- **Inercia y seguimiento con muelle** (amortiguamiento crítico) en todo lo que sigue a una mano: oculta los 10 Hz del sensor.
- **Escalonado** (*stagger*) de 40–80 ms entre elementos; nunca todo a la vez.
- **Respiración**: un ciclo global de 6–10 s que modula exposición (±3 %), niebla y deriva del ruido; la obra está viva sin manos.
- **Transiciones entre capítulos de 3–6 s** con un elemento que persiste (una partícula, una línea de horizonte, un color).
- Velocidad angular de cámara muy baja (≤ 2–3 °/s): a 360° el movimiento global marea; mover el contenido, no el mundo.
- Deriva por ruido de curl de baja frecuencia en vez de trayectorias paramétricas; el ojo detecta la repetición a los 20–30 s.

### 6.5 Acabado

- **AA temporal o SSAA selectivo**: líneas finas y especulares centellean en proyección; preferir geometría algo más gruesa y
  rugosidad ≥ 0,3 antes que pagar TRAA.
- **Precompilar** todos los materiales y precalentar las texturas antes del primer fotograma visible; ningún tirón al entrar.
- **Sonido y luz sincronizados por la misma envolvente**: cada ataque sonoro tiene su destello de 80–150 ms y su cola.
- **Aberración cromática, viñeta, lens flare: no** en 360° (no hay eje óptico). El equivalente noble es oscurecer suelo y
  techo (viñeta vertical por altura en metros) y dejar la banda de 0,9–1,7 m como zona de luz.
- Texto: poco, grande, con mucho aire, entrando por enfoque; un solo estilo por jerarquía.
- Probar siempre en la tira completa y con la escala corporal (tecla **B**): lo que funciona en pantalla suele ser 2× demasiado
  rápido y 2× demasiado pequeño en la sala.

---

## Recomendación del stack

### Para vendorizar esta noche (por prioridad)

| # | Qué | Licencia | Tamaño | Por qué |
|---|---|---|---|---|
| 0 | **Nada nuevo para el post**: usar lo que ya está en `vendor/…/jsm/tsl/display/` (GaussianBlur, Lut3D, Film, AfterImage, Sharpen, GTAO) y `VolumeNodeMaterial` del build | MIT | 0 | El mayor salto de calidad (volumétrica a 0,25, AgX, bloom por emisivos, LUT por capítulo) no requiere copiar nada |
| 1 | `jsm/libs/ktx-parse.module.js` + `zstddec.module.js` + `jsm/libs/basis/` | MIT (+BSD zstd) / Apache-2.0 | ~0,7 MB [aprox.] | Habilita KTX2: 4× menos VRAM, imprescindible si entran modelos de Blender con texturas 2k |
| 2 | `jsm/libs/fflate.module.js` | MIT | ~70 KB [aprox.] | Desbloquea `EXRLoader` (HDRI/lightmaps EXR) y evita errores de import |
| 3 | Assets propios de Blender en GLB + meshopt (decodificador ya presente) + AO/lightmap horneado | propios | ≤ 10–20 MB por escena | Geometría y luz de calidad sin coste en ejecución |
| 4 | Voz, efectos y música de ElevenLabs como archivos locales (WAV 48 kHz mono la voz; MP3/Opus la música) | salida propia según plan | ~6 MB/min WAV | Cubierto por la excepción del director para Ressonància (español/inglés, mp3); catalán y más peso, a confirmar |
| 5 | `jsm/libs/draco/gltf/` | Apache-2.0 | ~250 KB [aprox.] | Sólo si llega algún GLB de terceros con Draco |
| 6 | `@dimforge/rapier3d-compat@0.21.0` + `jsm/physics/RapierPhysics.js` (con `RAPIER_PATH` local) | Apache-2.0 | ~2 MB [aprox.] | Sólo si una escena necesita colisiones rígidas; si no, compute TSL |
| 7 | `jsm/libs/opentype.module.js` | MIT | ~170 KB [aprox.] | Sólo si se quieren títulos extruidos con `TextGeometry` |

Todo lo de `jsm/libs/` se copia de `node_modules/three/examples/jsm/libs/` de la versión **0.187.0** exacta, con su licencia
anotada en `LICENSE-*.txt` y en el `NOTES.md` de la obra.

### No vendorizar

troika-three-text (no fiable en WebGPU), `postprocessing`/`realism-effects` (sólo WebGL), three-msdf-text-utils (la obra ya
tiene SDF propio), lil-gui, cualquier dependencia GPL/LGPL.

### Decisiones técnicas recomendadas

1. Texto: seguir con `typo3d.js`; subir resolución del atlas de la serif si hace falta.
2. Post de la tira: sólo efectos de imagen sin cámara (bloom, grano, LUT, afterImage, blur) y con **muestreo envolvente en x**.
   Los efectos con cámara (TRAA, AO, DOF, SSGI) sólo por muro y sólo si el presupuesto lo permite a `?scale=1`.
3. Tone mapping: probar AgX frente al ACES actual; etalonaje por capítulo con LUT o nodos.
4. Partículas y simulaciones: compute TSL con `instancedArray`; contador reducido en el visor.
5. Compresión: meshopt + KTX2 con glTF-Transform fuera de línea; Draco sólo por compatibilidad.
6. Audio: una frase por archivo, `seed` fijo, catalán con `eleven_v3`/`eleven_v4` y `language_code: "ca"`.

### Pendiente de verificar (no dado por hecho)

- Tamaños marcados [aprox.] (no se ha descargado nada).
- Nivel de plan necesario para `wav_48000`/`pcm_48000` y tarifas de ElevenLabs; licencia comercial de la cuenta.
- TRAA/AO con el render multivista de `room3d.js`.
- Estabilidad de `LightMapper`/`LightProbeGrid`/VXGI de r187 a 7196 × 912.
- Coste real de cada efecto: medir con `?scale=1` en el portátil de desarrollo.

## Fuentes

- three.js r187, notas de versión: https://github.com/mrdoob/three.js/releases/tag/r187
- Lista de ejemplos r187: https://raw.githubusercontent.com/mrdoob/three.js/r187/examples/files.json
- Ejemplos leídos: `webgpu_compute_particles`, `webgpu_postprocessing_traa`, `webgpu_postprocessing_anamorphic`,
  `webgpu_volume_lighting` (https://github.com/mrdoob/three.js/tree/r187/examples)
- `RapierPhysics.js` r187: https://github.com/mrdoob/three.js/blob/r187/examples/jsm/physics/RapierPhysics.js
- Manual de WebGPURenderer: https://threejs.org/manual/en/webgpurenderer
- three-msdf-text-utils: https://github.com/leochocolat/three-msdf-text-utils
- troika y WebGPU: https://discourse.threejs.org/t/troika-three-text-and-webgpu/55737 · Codrops, efecto Gommage con MSDF y TSL:
  https://tympanus.net/codrops/?p=107900
- ElevenLabs: modelos https://elevenlabs.io/docs/overview/models · voz
  https://elevenlabs.io/docs/api-reference/text-to-speech/convert · efectos
  https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert · música
  https://elevenlabs.io/docs/api-reference/music/compose · voces https://elevenlabs.io/docs/api-reference/voices/search ·
  concurrencia https://elevenlabs.io/docs/help-center/technical/how-many-text-to-speech-requests-can-i-make-and-can-i-increase-it
- Poly Haven (CC0): https://polyhaven.com · glTF-Transform (MIT): https://gltf-transform.dev · meshoptimizer (MIT):
  https://github.com/zeux/meshoptimizer
