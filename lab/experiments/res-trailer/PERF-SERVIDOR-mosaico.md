# Etapa 1 (mosaico de entrada) en la GPU de la sala — informe del servidor

**Rama:** `perf/servidor-mosaico` (desde `lab/ressonancia-trailer` 661805b) · **Fecha:** 26-11-2026, 00:45–02:30 ·
**Máquina:** servidor de la sala (SMODE-CLIENT2), RTX A6000 **con el freno de hardware activo** («HW Power Brake Slowdown»).

## Resumen en cuatro líneas

1. **Sólo la obra** (laboratorio, 7196×912) en esta GPU frenada: **99 fps sin tope** y **~60 fps con tope**. El mosaico ya cabe en
   60 por sí solo.
2. **En la sala no llega a 60** (≈ 51 fps con tope, salida directa a los proyectores, app minimizada). **No es por la GPU**: está
   al 64–74 % de uso y, con la salida a escala 0,5, al **36 %** y aun así sólo da 56,6 fps. El límite está en la **cadena de la
   app**: la obra dibuja, la salida copia el lienzo WebGPU a su mezcla WebGL2 y lo presenta, todo en serie. Está fuera de `lab/`
   (ver §5): es trabajo del developer.
3. Dentro del mosaico apliqué **un cambio seguro** con la imagen idéntica: −6 % del tiempo de los muros, de 99 a 103 fps sin tope.
4. Lo demás que pedía el encargo lo **medí antes de tocarlo**, y su techo es pequeño en esta GPU (tabla §3). No lo cambié: con
   el estreno mañana, el riesgo no compensa la ganancia.

---

## 1. Cómo se midió

- Kit del estudio (`lab/tools/perf/`): `serve.mjs` en 8795, proxy en 8797, `run-uncapped.cjs` + `perf-routine.js`, URL
  `?capture&demo=0&scale=1&perf&params={"jump":"wait","mosaic":"image"}` (el modo `image` es el que se usa en la sala).
- Con la app de la sala cerrada (la GPU libre para el laboratorio). Cada variante, dos o más veces.
- **Reloj de la GPU**: con el freno oscila entre **150 y 450 MHz** sin que cambie la carga. Por eso las comparaciones se hacen
  con la **proporción `muros ÷ (taa + post)`** de la misma pasada y con los fps sin tope de pasadas seguidas.
- **En la sala**: la app armada con la rama (`scripts/integrate-lab.mjs` sobre `main` ea7cf5c, `npm run dist`), salida directa a
  DISPLAY6 (Advanced Output con los recortes de Resolume «Palo Alto Final»), escala 1, 60 fps, ventana minimizada. Los fps
  salen de `/ws/ui` y el reloj y el uso de la GPU de `nvidia-smi`, cada segundo.

## 2. Antes / después

### Laboratorio (sólo la obra, sin tope)

| Versión | fps sin tope | GPU ms | Muros ms | TAA + post ms | Proporción | Reloj |
|---|---|---|---|---|---|---|
| 661805b (base, 4 pasadas) | 99 | 8,47–8,58 | 6,39–6,46 | 2,05–2,07 | **3,12** | 367–450 MHz |
| `8a1fae7` (sin la luz de mano apagada, 2 pasadas) | **103** | 8,11–8,20 | 5,99–6,10 | 2,07 | **2,92** (−6 %) | 367–450 MHz |

Con tope (`run.cjs`, ventana a 60 Hz), durante las capturas: 56–61 fps antes y después.

### Sala (con tope, salida directa, app minimizada)

| Versión | Escala de salida | fps | Reloj medio | Uso de GPU |
|---|---|---|---|---|
| 661805b | 1 | 51,3 | 428 MHz | 64 % |
| 661805b, salida a Spout (sin recortes a pantalla) | 1 | 55 | 328 MHz | 80 % |
| `8a1fae7` | 1 | 50,7 | 319 MHz (mín. 157) | 74 % |
| `8a1fae7` | **0,5** | **56,6** | 371 MHz | **36 %** |

Las dos versiones dan lo mismo en la sala, dentro del ruido del reloj. Lo que limita en la sala no es el mosaico (§5).
Referencia de la noche anterior (182b646, antes del trabajo del estudio): ~45 fps en la misma configuración.

## 3. Qué pesa en el mosaico (medido con interruptores, todos sin tope y en la misma sesión)

| Variante | Interruptor | fps | Muros ms | Lectura |
|---|---|---|---|---|
| Base | — | 99 | 6,46 | |
| Sin mosaico | `pnohero` | 150 | 1,48 | El mosaico se lleva ~4,9 ms de los muros |
| Sin detalle por píxel | `pflat` | 107 | 5,74 | El ruido horneado ya sólo cuesta ~0,7 ms (buen trabajo del estudio) |
| Sin movimiento curl | `pnoidle` | 100 | 6,25 | ~0,2 ms |
| **Sin trabajo por pieza en el vértice** | `pvtx0` *(nuevo)* | 107 | 5,70 | **Techo del punto 1 del encargo: ~0,76 ms** |
| Sin recorte de aperturas | `pnodoor` *(nuevo)* | 102 | 6,22 | ~0,24 ms |
| Sin reversos de las piedras | `pnoback` *(nuevo)* | 101 | 6,23 | ~0,23 ms (punto 2) |
| Sin luz de mano | `pnopool` *(nuevo)* | 103 | 6,07 | **0,39 ms → aplicado** |
| Sin bloom | `pnobloom` | 106 | — | post 0,84 → 0,26 ms (~0,6 ms) |
| Sectores 96 / 192 | `psect=N` *(nuevo)* | 99 / 98 | igual | Se dibujan los mismos 2,77 M triángulos: lo que sobra es el margen de seguridad, no el tamaño del sector |
| Indexar la geometría | `pidx` *(nuevo)* | — | — | 4,78 M vértices, 4,54 M únicos: sólo un 5 % se reutilizaría |

**Conclusión:** en esta GPU el mosaico cuesta sobre todo por la **cantidad de triángulos pequeños** (2,77 M por fotograma), no por
el cálculo de cada vértice ni de cada píxel. Ninguna parte del shader explica más del 12 %.

## 4. Qué cambié y qué no

### Cambié (commits en la rama)
- **`f527930`** — interruptores de medida (sólo laboratorio; sin ellos no cambia nada): `pnodoor`, `pnopool`, `pvtx0`, `pnoback`,
  `psect=N`, `pidx`.
- **`8a1fae7`** — **la luz de mano apagada ya no se calcula.**
  - Qué era: `HAND_POOL = 0` multiplicaba por cero seis `exp()` por píxel del mosaico.
  - Qué hace ahora: el término sólo se construye cuando `HAND_POOL` es distinto de 0.
  - Imagen: idéntica al bit (x · 0 = 0). Capturas en `perf-shots/` (antes / después: detalle de P4 y esquina P4|P1 en reposo, la
    mano que llega y la mano quieta).
  - Ganancia: −6 % en los muros, de 99 a 103 fps sin tope.

### Probé y no cambié (y por qué)
- **Punto 1 (trabajo por pieza en un pase de *compute*):** el techo medido es 0,76 ms (12 % de los muros) y el pase de *compute* se
  comería una parte. Es un cambio grande en el material para mañana. **No compensa.**
- **Punto 2:**
  - Indexar sólo reutilizaría un 5 % de los vértices: los vértices repetidos tienen normales distintas (piedras facetadas).
  - Quitar los reversos ahorraría 0,23 ms, pero cambia cómo se ve una piedra al girar.
  - **No compensa.**
- **`doorK` precalculado por piedra en reposo:** techo de 0,24 ms. Es posible con una rama uniforme (`If`) y el valor en el canal
  libre `w` de la fila 4 de `pieceTex`, pero el cálculo en JS tendría que replicar el de la GPU. **Lo dejo anotado para después.**
- **Sectores más finos:** sin ganancia (ver tabla).
- **Bloom a ½ resolución:** ~0,4 ms, pero cambia un poco el halo y está en `room3d.js`, que usan todas las etapas. **No lo toqué.**
- **Subidas CPU→GPU y bucle por pieza (puntos 3 y 4):** sin tope, la diferencia entre el tiempo de fotograma (~10 ms) y la GPU
  (~8,5 ms) es pequeña. No son el cuello de botella en esta máquina. No las medí por separado.

## 5. Lo importante para llegar a 60 en la sala: la cadena de salida de la app (fuera de `lab/`)

Datos:
- **La obra sola llega a ~60 con tope** en la misma GPU frenada (`run.cjs`, 7196×912).
- **En la sala, salida directa a escala 1: ~51 fps con la GPU al 64–74 %.** No está llena.
- **Con la salida a escala 0,5: 56,6 fps con la GPU al 36 %.** Casi parada, y aun así no llega a 60.
- Con Spout (sin la presentación en DISPLAY6): ~55 fps.

Interpretación (hipótesis fuerte; hay que confirmarla con `window.__out.stats.timing` de la ventana de salida):
- Cada fotograma de la sala es **obra (WebGPU, en un iframe) → `__vtLayerFrame` → copia del lienzo a la mezcla WebGL2 → composición
  → recortes → presentación**.
- La copia de un lienzo WebGPU a una textura WebGL2 obliga a esperar a que la obra termine en la GPU, así que los tiempos **se suman
  en serie** en vez de solaparse.
- Con ~16,6 ms por fotograma, cualquier espera de más hace perder el vsync, y la media cae a 50–56 aunque sobre GPU.

Qué recomiendo mirar en `ui/js/output.js` y `ui/js/mixer/`:
1. Medir en la sala `stats.timing` (`gpuMs.copy`, `gpuMs.compose`, `gapMs`). La ventana de salida ya lo calcula.
2. Si la copia es la espera:
   - componer con el fotograma **anterior** de la obra (doble búfer: un fotograma de latencia, pero sin espera);
   - o, cuando la obra es la única capa visible, **presentarla sin copiarla**;
   - o una mezcla en WebGPU que comparta la textura.
3. Ver también la vista previa: cuando alguien mira el panel Output de la app, una miniatura a 1 Hz y su lectura cuestan ~15 fps
   (medido la noche anterior).

## 6. Recomendaciones para las otras etapas

- Medir con el kit, y con la proporción, en el portátil y aquí. Aquí el reloj oscila mucho: comparar siempre dentro de la misma
  sesión.
- Plaza (14,6 ms en el portátil) y correfoc (11,9 ms) son las más pesadas. Antes de optimizar, hacer el mismo inventario de
  interruptores que en §3 (geometría ×4 cámaras, detalle por píxel, post) para ver qué es grande de verdad en cada una.
- Buscar términos multiplicados por constantes 0 que se siguen calculando (como la luz de mano): son ganancias gratis.
- El freno de la GPU (150–450 MHz en vez de ~1800–2100) lo tiene que resolver quien montó el servidor. Con la GPU sana, todo esto
  tendría mucho margen.

## 7. Pendiente

- Confirmar en la sala la hipótesis de §5 con `stats.timing` (developer).
- Si hiciera falta más margen dentro del mosaico: `doorK` precalculado en reposo (~0,24 ms) y bloom a ½ (~0,4 ms, `room3d.js`).
- Consola: en cada pasada aparece `TypeError: Failed to execute 'writeBuffer' on 'GPUQueue': parameter 1 is not of type 'GPUBuffer'`.
  También está en 661805b sin mis cambios. No parece afectar a la imagen, pero conviene mirarlo.
