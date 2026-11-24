# T-030 · 3D-PI · II. Pinya de puntos y fibras (turquesa y coral)

- **Dueño:** 3D-PI · **Origen:** OLA-ARTE2 (24-11) + ARTE-2 §3 (ref. 10: torre de fibras, puntos y cubos de datos) · Vicente: «los cuerpos aún se ven un poco maniquíes de cerca».
- **Archivos (sólo estos):** `ressonancia/scenes3d/parts/pinya3d.js`, `parts/pinya3d/` (body.js + nuevos módulos si hacen falta),
  `res-3d-study/parts/pinya3d.json`, `lab/estudio/notas/3D-PI.md`, mi fila de `TABLERO.md`.
- **Respaldos:** `parts/pinya3d/pinya3d.ARTE2.js.bak`, `parts/pinya3d/body.ARTE2.js.bak` (antes de tocar nada).

## Qué se construye
1. **Cuerpos de nube de puntos.** Se conserva el kit de cuerpo (`body.js`: esqueleto, SDF, 3 poses dormido/despierto/rotllana,
   fragmentos). De cada tipo de cuerpo se muestrean ~900 puntos de su superficie (con sus 3 poses, normal y fragmento) y se dibujan como
   discos pequeños instanciados por cuerpo (458 cuerpos, mismos anillos y terrazas, mismo culling por sectores). Color: turquesa de base,
   coral donde hay calor (mano, pulso, banda de la rotllana); borde más brillante (silueta) para leer el volumen. Adiós a la arcilla.
2. **Fibras del cuerpo.** ~14 fibras por cuerpo siguen la cadena de huesos (pie→cadera→columna→cabeza, mano→codo→hombro→columna), con
   desplazamientos al azar: cintas finas orientadas a cámara, color hueso/coral. Raíces en las terrazas que atan a cada cuerpo con sus vecinos.
3. **Fibras hacia la mano (interacción).** Al llegar una mano (mismo frame): destello en la palma y un haz de ~32 fibras que brota de la palma
   hacia la multitud y se ancla en los cuerpos y en la tierra detrás; mientras se sostiene, el haz **se tensa** (se endereza) y los cuerpos
   enganchados **se inclinan con todo su peso y se elevan** hacia la mano; al soltar, las fibras se aflojan y se retiran.
4. **Interacción física: cubos de datos.** ~140 cubos de alambre y teselas (turquesa/coral/blanco) flotan en la capa cercana (0,1–1 m tras
   el muro, 0,5–2,6 m de alto), girando despacio. La mano los **suelta**: caen con gravedad, giran y **rebotan** en el suelo y en las
   terrazas, se asientan, y a los ~6 s vuelven a subir a su sitio ensamblándose. Respuesta < 100 ms. Eventos de impacto anotados para sonido.
5. **Tres profundidades.** Cercana: cubos/teselas a 0–1 m del muro · media: la multitud a 5,9–8 m · lejana: una nube de puntos y fibras
   turquesa/coral a 18–35 m, con deriva lenta.
6. **Movimiento de sala.** Con el llenado medio de los muros la multitud **sube alrededor de la sala** (hasta +0,5 m, velocidad limitada);
   al cerrarse el círculo **toda la pinya gira** con la rotllana (≤ 3°/s, con aceleración suave), y se detiene suave en el premio.
   Sólo se mueve el grupo de la parte.
7. **arrive/leave por fragmentación**: los puntos vuelan por fragmentos (mismo esquema en el vertex shader), las fibras se retiran/crecen,
   los cubos se dispersan/ensamblan. Más cortos si INT lo pide.
8. **Premio (reward):** los puntos se cuartean en teselas de color (el trencadís que viene) en vez de la arcilla seca.

## Pasos y punto seguro de corte
1. Respaldos · 2. puntos de cuerpo (sustituye la malla) → **corte seguro 1** · 3. cubos físicos → **corte seguro 2** · 4. fibras de mano
· 5. fibras de cuerpo + raíces · 6. fondo lejano · 7. movimiento de sala · 8. integración en la obra y comprobaciones.
Cada corte deja la parte funcionando sola y en la obra.

## Cómo volver atrás
Copiar `parts/pinya3d/pinya3d.ARTE2.js.bak` → `parts/pinya3d.js` y `parts/pinya3d/body.ARTE2.js.bak` → `parts/pinya3d/body.js`
(y el json si cambió: `pinya3d.ARTE2.json.bak`).

## Prueba
- `res-3d-study/index.html?part=pinya3d`: dormidos, fill 1, 4 manos fijas (fibras + cubos cayendo), cerrado (giro), leave 0,45, arrive 0,55.
- `res-obra3d/review.html?from=pinya`: el bloque entero con público virtual; sin errores de consola en WebGPU y `renderer: webgl2`.
- Capturas en `notas/3D-PI.md`. fps: no los mide 3D-PI (QA).
