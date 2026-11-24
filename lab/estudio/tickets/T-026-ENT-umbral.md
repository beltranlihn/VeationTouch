# T-026 · ENT · La entrada: el «umbral» (bloque `wait`)

- **Dueño:** ENT · **Verifica:** QA · **Integra en la obra:** INT (pone `umbral3d` en el bloque `wait`) · **Dibuja el botón:** GUI.
- **Vicente (24-11):** «esa primera parte tiene que ser algo muy interactivo, libre, muy rico de ver y pro… para poder mostrar el
  despliegue de la sala… y que en esa interactividad se revele el botón de start… y al presionarlo pasamos a la intro.»

## Archivos (sólo estos)
- `ressonancia/scenes3d/parts/umbral3d.js` (nuevo) + `parts/umbral3d/` (sólo si hace falta un asset; hoy todo generado).
- `res-3d-study/parts/umbral3d.json` (nuevo).
- `ressonancia/score.js` — bloque `wait`: `state.reveal` y la regla del botón. **Copia idéntica** en `ressonancia-sound/score.js`.
- `ressonancia-sound/` — voz en español por defecto (`manifest.json` + `sound.js`), sonidos de la entrada, canal `fx:impact`.
- `notas/ENT.md`, mi fila de `TABLERO.md`.

## La pieza (diseño)
Un **umbral de trencadís** alrededor de los cuatro muros, 360° continuo, en tres profundidades:
1. **Primer plano (0–1 m tras el muro): las teselas colgantes.** ~120 teselas físicas (cerámica esmaltada, cromo, vidrio
   iridiscente) colgadas de hilos invisibles en una banda alrededor de la sala, a la altura de las manos. **Interacción física:**
   la mano las golpea → se balancean (péndulo), giran; un golpe fuerte las **descuelga**: caen con gravedad, rebotan en un suelo
   invisible a 0 m, ruedan y se quedan; al rato vuelven a subir a su hilo (el mundo se recompone: el trencadís). Respuesta en el
   mismo frame.
2. **Plano medio (3–8 m): la torre de fragmentos que gira.** Anillos de teselas grandes de cromo y vidrio que orbitan lentos a
   distintas alturas — el «despliegue» de la sala: siempre algo pasa por cada muro.
3. **Fondo (15–40 m):** polvo de estrellas/teselas lejanas y un horizonte de brasa (el «hilo de brasa» de ARTE-2 para la espera).
- **Movimiento de sala:** todo el mundo gira muy lento alrededor del público (≤ 1,5°/s) y respira arriba/abajo (±0,15 m, 20 s).
- **La revelación:** con `reveal` las teselas caídas y las de la banda se atraen hacia el **centro de cada muro a 1,25 m** y se
  ensamblan en un anillo de trencadís (donde GUI dibuja el botón); con `start` el anillo gira y brilla; al empezar, estalla.
- **Sin manos:** bucle atractivo: un «fantasma» toca alguna tesela de vez en cuando (cae una, suena), las órbitas siguen.
- Paleta (ARTE-2 §3, Espera): negro, un hilo de brasa, cromo; el esmalte del trencadís en blanco hueso, azul cobalto y ocre.

## La regla del botón (score.js, bloque `wait`)
- `reveal` sube con el juego: cada mano que aterriza +0,02 (máx. 3 por paso) y cada mano sostenida +0,006/s (máx. 6 manos).
  Dos personas jugando lo revelan en ~20–55 s. Sin manos durante 6 s baja (−1/45 por s). **Una vez revelado (=1) se queda** mientras
  haya alguien (hasta 25 s sin manos). Evento `'reveal'` al completarse.
- `start` sólo se llena con `reveal >= 1` (y 1 s después, mientras GUI ensambla el botón) y con manos **sobre el botón**
  (|dx| ≤ 0,55 m del centro del muro): 3 s con dos manos, 4,5 s con una. Al llenarse: `'start'` → intro, como antes.
- `progress` en `wait` sigue siendo `start`. El resto del score no cambia.

## Pasos
1. Ticket (13:15). 2. score.js + copia idéntica; prueba de la regla con un script de nodo (2 personas → 20–60 s).
3. umbral3d.js v1: tres capas + teselas físicas + revelación desde parámetros (`reveal`, `start`, stand-in automático).
4. Capturas (`check.mjs --shot`) en WebGPU y WebGL2, sin errores → `notas/ENT.md` (15:30). Aviso al director: listo para INT.
5. Sonido: `lang` = `es` por defecto; en `wait`: impactos de teselas (síntesis modal cerámica/cromo/vidrio), un brillo que crece con
   `reveal`, un acorde de vidrio en `'reveal'`, un golpe con cola en `'start'`. Canal `fx:impact` (lado sonido).
6. Integrado (INT) y entregado a QA (18:00).

## Punto seguro de corte / volver atrás
- `score.js`: respaldo `score.ARTE2.js.bak` (ambas copias). Volver = copiar el .bak encima de las dos.
- `sound.js`/`manifest.json`: respaldo `.ARTE2.js.bak` / `manifest.ARTE2.json.bak`.
- `umbral3d.js` es nuevo: si no está listo, INT no lo pone en `wait` y la espera sigue como hoy (sólo hace falta que la regla del
  botón no la bloquee: si hace falta, `reveal` arranca en 1 con `?times` o se revierte el score).

## Prueba
- Estudio: `res-3d-study/index.html?part=umbral3d` sin errores en WebGPU y WebGL2 (`renderer: webgl2`), con capturas.
- Score: script de nodo con 2/6/15 personas virtuales: tiempo hasta `reveal = 1` y hasta `start`; idle → no se revela; el resto del
  pase igual (mismas transiciones con `jump`).
- Sonido: `node lab/tools/check.mjs "/sound/ressonancia-sound" --delay 5000` → `errors: []` (silencioso).
