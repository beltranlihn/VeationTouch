# LUZ — notas (T-053 «elegante y pulcra», + ARTE RONDA 5)

Método: `res-obra3d/index.html?demo=0`, estado congelado por bloque, una mano en P4 a 1,30 m, tira entera 7196 × 912 (script de SIS
adaptado; `check.mjs` con ventana de 40 s en mi scratchpad porque la obra en WebGL2 pasa de 15 s). WebGL2 = `params={"renderer":"webgl2"}`.
Silencioso. Antes = `<parte>.T053.js.bak` puesto en su sitio un momento; después = la parte actual.

Decisión común: **no añado `room.lightRecipe().group`** a mis partes. Todas sombrean a mano (MeshBasic/Sprite node, ninguna luz las
toca), así que la receta se adopta en el sombreado (cálida arriba, filo frío/lila vía rim, relleno bajo), y añadir PointLight/Hemisphere
cambiaría el conjunto de luces entre pasadas. Además el host (`res-obra3d/experience.js`) pone las luces «steady» (hemisferio) a
intensidad 0 al salir y no las devuelve al volver: una receta añadida se quedaría a 0 tras la primera salida (para SIS/RND-F).

## 1. Festa (corona + ressonància) — `festa3d.js` · hoja `luz/t053-festa.jpg`
- Corona luminosa y limpia: la placa ya no cae al 20 % al empezar (42 % → sube con el relleno); espejo en calma durante la corona
  (oleaje ×0,25, curvatura ×0,3); entorno cálido abajo y guirnaldas suaves en la corona (`U.cw`); brillo blanco del entorno ×0,5.
- Arena: en reposo ×0,75 (corona 0,2 + 0,8·lluvia), sin estela en la corona, lluvia de oro a la mitad y en granos redondos (sin raya vertical).
- Fuera las franjas pixel-sorted (`bandK` 0): no hay glitch fuera de la transición.
- Un acento (oro): lila al 30 % de saturación (valles, entorno bajo); esferas sólo cromo (sin casquete índigo).
- Un protagonista por muro: la esfera Ø 0,6 m con su aro + una compañera alta; fuera la esfera baja y las 10 cuentas (ni se dibujan ni
  se simulan); halo suave detrás de la esfera (`room.makeHalo`, ≤ 0,16); filo frío y la luz de la mano (`room.flash`) en esfera y aro.
- Capa lejana: 900 → 405 esquirlas, al 73 % de brillo.
- Zona tranquila: elipse radial suave (centro 1,8 m, 4 × 2,4 m) en oscuro cálido `#120C06`, velo al 60 %; ya no es un rectángulo índigo.
- Interacciones intactas (impulsos, ecos, llamada, florecimiento, aleta, pico). 0 errores WebGPU y WebGL2.
