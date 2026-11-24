# T-008 · 3D-PO · Pom de dalt: altura creíble y relieve

- **Dueño:** 3D-PO · **Revisa:** QA · **Depende de:** veredicto de QA sobre T-003 (no se toca `pom3d.js` hasta tenerlo)
- **Archivos:** `lab/experiments/ressonancia/scenes3d/parts/pom3d.js`, `lab/experiments/res-3d-study/parts/pom3d.json`,
  `lab/estudio/notas/3D-PO.md`. Si hace falta compartir código con `castell.js`: **no se edita castell.js**; se pide a su dueño
  exportar el generador de cuerpos (ver paso 2) o se copia la parte mínima con atribución en un comentario.
- **Decisión del director (23:0x):** paso 2 = copia mínima del generador de cuerpos dentro de `pom3d.js` con el comentario
  `// from parts/castell.js`; `castell.js` no se toca (su único escritor es INT). T-008 empieza tras el veredicto de QA sobre
  T-003 (~23:25); si QA da FALLA, primero se corrigen sus puntos.
- **Regla de corte:** cada paso termina en un estado entregable (sin errores WebGPU/WebGL2, capturas s1–s6 rehechas). Si el
  tiempo se acaba, se entrega el último paso cerrado.

## Paso 0 — Coste por mano acotado (prioridad; pedido del director tras la medida de QA) · ~40 min
Medida de QA (T-003): 6,2–7,3 ms la pieza sola; **12,1 ms con 15 manos** (≈ 0,35 ms por mano). Objetivo: **≤ 8 ms con 15 manos**.
Causa: la capa de manos es un quad que cubre cada muro entero, y CADA píxel de los 4 muros recorre todas las manos (halo, estrellas
reunidas), todos los segmentos de constelación y todas las ondas: coste = píxeles × (manos + segmentos + ondas).
Plan:
- Sustituir la capa de muro a pantalla completa por **sprites instanciados en el plano del muro**, uno por elemento, del tamaño de
  su influencia: halo + estrellas reunidas = quad de 1,6 m centrado en la mano (máx. 16); onda = quad de 2·radio (máx. 16);
  línea de constelación = cinta instanciada de ~8 cm entre dos manos (máx. 24; para manos en muros contiguos, dos tramos que se
  parten en la esquina, en coordenada de perímetro). Cada píxel paga sólo lo que lo cubre: coste ≈ área de manos, no manos × muro.
- Mezcla aditiva como ahora; mismo aspecto (mismas fórmulas, evaluadas en coordenadas locales del sprite). El descarte por muro
  (`cameraWorldMatrix` · normal) se mantiene para que un sprite junto a una esquina no se dibuje en el muro vecino con otra perspectiva.
- Seguridad: un solo pase de dibujo por tipo (3 draw calls), sin bucles en el fragmento.
Pruebas: capturas con 4 y con 15 manos fijas (eval con 15 `pointerdown`), comparadas con T-003 (mismo aspecto); QA mide con 0, 4
y 15 manos en su turno: ≤ 8 ms con 15. Corte seguro: tras este paso (es el que más importa para la sala).

## Paso 1 — Torres a escala de castell (lo más barato y lo que más cambia el sentido) · ~45 min
Problema: las torres de brasas suben hasta la altura final del ojo (≈ 35 m), mucho más que un castell de 5–9 pisos.
Plan:
- Altura de la torre = `state.floors` (5–9; estudio: parámetro `floors`, por defecto 7) × 1,35 m + pom ≈ 7–13 m.
- La subida del ojo se separa de la de la luz: el ojo sigue subiendo hasta `height` (vértigo, tejados, nubes), pero las tres
  luces trepan el castell real: `rel` deja de ser relativo al ojo; la luz usa altura mundo `y = floorsTop · f(i, c)`
  (dosos hasta el penúltimo piso, acotxador al último, enxaneta a la cima).
- Para que la luz siga en ventana mientras el mundo se hunde: el castell se queda **abajo**, visto desde arriba (es lo que dice
  el guion: «el castell queda como una silueta de brasas abajo»). La altura del ojo se limita a que la cima quede a ≥ −20° bajo
  el horizonte a 9,5 m: `Amax ≈ cima + 3,5 m` mientras la luz trepa; al llegar la enxaneta el ojo puede seguir subiendo un
  poco (aliento contenido) y la luz queda abajo, en el centro de la mirada. Alternativa si eso pierde vértigo: torres más lejos
  (14–18 m) para verlas enteras desde 20 m.
- Hilo y baliza se recalculan con la nueva función de camino (build() ya se rehace si cambian orden o altura; añadir `floors`).
Pruebas: capturas p = 0,1 / 0,5 / 1 con floors 5 y 9; la luz visible en ventana en todo el recorrido (evaluar `pathPos` contra
el frustum de cada muro en un `--eval-file`: devolver el % de muestras dentro de ventana, debe ser 100 %).
Corte seguro: tras este paso.

## Paso 2 — Torres que se leen como cuerpos · ~60 min
Problema: columnas de puntos, no personas.
Plan:
- Reusar los cuerpos de `castell.js` (esqueleto + IK + muestreo de superficie). Pedir a su dueño un export puro
  `buildCastell({ kind, tiers, seed }) → { positions, normals, energy, top }` sin THREE (sólo arrays). Mientras no exista:
  copia mínima de `skeleton()` + muestreo, marcada `// from castell.js (owner: director)`.
- Densidad baja (≈ 600 partículas por persona), color brasa (rojo-naranja, 0,05–0,4), silueta más brillante (rim por la
  normal, como castell), un oclusor de profundidad opcional (el de castell) sólo si cabe en fps.
- Brillo extra alrededor de la luz que trepa (uniform con la posición de las tres luces, falloff 1,5 m): la enxaneta ilumina
  los cuerpos que pisa.
Pruebas: recorte a resolución completa (7196×912, `sips -c`) de la torre a 9,5 m: QA debe reconocer personas en pie y
hombros; recuento de partículas ≤ 25 k en total.
Corte seguro: tras este paso (si fps cae, bajar densidad por parámetro `bodies`).

## Paso 3 — Fachadas con relieve real · ~60 min
Problema: cajas planas con ventanas dibujadas; la plaza se ve de cerca al principio.
Plan (sólo los 4 lados de la plaza; el casco antiguo sigue en cajas, se ve lejos):
- Geometría fusionada por lado (como plaza.js, sin importarla): ventanas hundidas 0,3 m (marco + vidrio emisivo al fondo),
  balcones (losa con ménsulas + baranda de hierro con barrotes como geometría o con `discard` por patrón), cornisa de remate,
  impostas por piso, arcadas en planta baja en un lado.
- Instanciado: un «módulo de vano» (ventana + balcón + baranda) como `InstancedMesh`, ≤ 300 instancias; mantener ≤ 8 búferes de
  vértice (sin `uv` si no se usa; atributos por instancia intercalados en un búfer).
- Sombreado: mismo `cityMat` (luna, resplandor de calle, charcos de farola) + oclusión horneada por cara.
Pruebas: captura p = 0,05 a resolución completa de una fachada; WebGPU sin «Vertex buffer count»; `__pom3d.verts` reportado.
Corte seguro: tras este paso.

## Paso 4 — Fibras sin parpadeo · ~45 min
Problema: líneas de 1 px que «hormiguean» al moverse (aliasing temporal).
Opciones, en orden de coste:
1. **Brillo por cobertura:** atenuar cada fibra por su longitud proyectada en píxeles (`fwidth` de la posición) y subir
   la densidad; menos energía en segmentos sub-píxel.
2. **Cintas suaves:** cambiar `LineSegments` por cintas instanciadas de 1,5–2 px con perfil gaussiano (el mismo esquema que el
   hilo de oro, ya probado), alfa aditiva; coste ≈ 2× triángulos pero sin hormigueo. Reducir la densidad un 30 % para compensar.
3. (sólo si 2 no basta) un búfer de historia para las nubes — el host no lo ofrece; sería una petición a INT.
Pruebas: dos capturas a 0,2 s de distancia (`"run":true`), diferencia de imagen en la zona de nubes (script de comparación de
QA): el ruido entre fotogramas debe bajar ≥ 50 % frente a T-003 a igual brillo medio.
Corte seguro: tras la opción 1.

## Paso 5 — Comprobaciones de cierre
- WebGPU y WebGL2 sin errores; capturas s1–s6 nuevas en el cuaderno; arrive y leave intactos.
- fps: lo mide QA en su turno (≥ 50 a escala 1 sola en el M1 Max). Si no llega: parámetros `fibres`, `bodies`, `facadeDetail`.
- `notas/3D-PO.md` actualizado y fila del tablero a «entregado».
