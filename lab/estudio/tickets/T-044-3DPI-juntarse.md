# T-044 · 3D-PI · Pinya = juntarse (PALMA → SEGUIR → APRETAR)

- **Dueño:** 3D-PI · **Origen:** PLAN-INTERACCION.md § 2 paso 4 (aprobado por Vicente) · score de ENT tras el paso 0 (`span[w]`, eventos `palm`, `pack:w`).
- **Archivos:** `parts/pinya3d.js` (+ `parts/pinya3d/`), `res-3d-study/parts/pinya3d.json`, `notas/3D-PI.md`, mi fila de TABLERO.
- **Respaldo:** `parts/pinya3d/pinya3d.T044.js.bak` (volver = copiarlo encima).

## Qué
1. **Palma con palma = la diana.** En cada muro una figura de puntos espera con la palma abierta sobre el muro (centro, 1,25 m): es el
   objetivo (sin anillo; el anillo lo quita GUI). Una mano que llega en otro sitio: sale de la primera fila otra figura y apoya su palma
   en la mano (≤ 0,4 s el destello, ~1 s el contacto). Pool de 12 figuras (nube de puntos con dedos).
2. **Seguir.** Con la mano en contacto, la figura se desliza hacia el pie de la torre (centro del muro) a ≤ 0,3 m/s y la palma con ella:
   el visitante la sigue. Si la mano se queda atrás (> 0,45 m), la figura espera y vuelve a buscarla. Las palmas de un muro se ordenan
   hombro con hombro (0,5 m) alrededor del centro.
3. **Huecos y luz.** La primera fila y el primer anillo se encienden detrás de cada palma (gaussiana 0,55 m); entre visitantes separados
   quedan **agujeros oscuros**; al juntarse las luces se funden y un pulso pasa de cuerpo a cuerpo por las cuerdas.
4. **Apretar → los baixos.** Con un muro apretado (`pack:w`, o el sustituto: ≥ `packN` manos en ≤ 1,5 m), los tres cuerpos del centro de
   su primera fila **suben** a hombros de la pinya (0,45 m, 2,5 s, coral) y la multitud **se balancea** (una ola lenta). Con los muros
   necesarios apretados, el balanceo es de toda la sala.
5. **Sustituto (estudio y hasta que llegue el score):** span y apretado calculados de las manos por muro; parámetros `palm`, `packN`, `slide`.

## Corte seguro / prueba
Cada paso deja la parte funcionando. Estudio: 2 manos fijas en P1 separadas 1,5 m → las figuras se deslizan al centro, las manos siguen
(arrastre en el arnés), al juntarse suben los baixos; 0 errores WebGPU y WebGL2; obra sin cambios de score.
