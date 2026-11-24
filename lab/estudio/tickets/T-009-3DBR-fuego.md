# T-009 · 3D-BR · Brasa: el fuego, segunda pasada

- **Dueño:** 3D-BR · **Verifica:** QA · **Depende de:** veredicto de QA sobre T-001 (no se toca el part hasta tenerlo)
- **Archivos (único escritor):** `lab/experiments/ressonancia/scenes3d/parts/brasa3d.js`,
  `lab/experiments/res-3d-study/parts/brasa3d.json`, scripts de prueba en el scratchpad, `lab/estudio/notas/3D-BR.md`.
- **Regla de turnos:** capturas y comprobaciones libres salvo durante un turno GPU-MEDICIÓN de otro; fps sólo con turno.
- **Orden y puntos de corte seguros:** 1 → 2 → 4 → 5 → 3. Cada paso deja el part entero y sin errores; si el tiempo se acaba, se
  entrega lo hecho y lo demás queda como está en T-001 (todos los pasos son locales a un bloque del archivo).

## 1. Esquirlas que leen piedra y espejo, no confeti (bloque «5. fragments»)
Hoy: un cuadrilátero plano de doble cara, color casi negro + brillo de luna.
- **Grosor y bisel:** sustituir el quad por una losa baja: prisma de 6 caras con aristas biseladas (≈ 20 vértices, una geometría
  compartida, instanciada igual que ahora). Grosor 12–22 % del tamaño, por instancia (`aSd`). La forma irregular sale de desplazar
  los 4–6 vértices del contorno con la semilla (ya existe `jit`), el bisel acompaña.
- **Dos materias por esquirla:** una cara de piedra (arenisca oscura, ruido fino de grano, sin brillo) y otra de espejo (oscuro,
  reflejo de la luna afilado + reflejo cálido del anillo cuando mira hacia abajo); los cantos, piedra. Selección por `normalLocal`
  antes de girar (cara superior / inferior / canto). Mismo lenguaje que el espejo de `plaza.js` (`mirrorMat`), sin copiar su envMap.
- **Brillo:** fresnel en el canto (una línea fina de luz al girar), especular con potencia 60–80 y bajo (≤ 0,35); el destello sólo
  cuando el giro lo alinea, nunca todos a la vez.
- **Encendido:** al aterrizar, el calor entra por los cantos primero (máscara por la distancia al contorno), luego la cara.
- **Pruebas:** captura a 7196×912 con `arrive=0.3` y `leave=0.5`, recorte de 1200×600 de un muro; comparar con el recorte de las
  esquirlas de `plaza` (`?part=plaza&params={"shatter":0.4}`). PASA si a 100 % se leen losas con canto y dos caras, no papel.
- **Coste:** ×5 vértices en 2 400 instancias = ~48k vértices: despreciable.

## 2. Diables a paso humano (bloque «4. diables», `update` → devils)
Hoy: los de ola van pegados al frente (3 m/s en el muro ≈ 8 m/s en el mundo).
- **Velocidad en el mundo, no en el muro:** convertir `spd` a m/s de mundo: `ds/dt = v_mundo · tw / (tw + d)`. Correr 2,5–3,5 m/s,
  bailar 0,8–1,5 m/s. La cadencia sale de la velocidad real (1,6–3,0 Hz) con zancada 0,9–1,3 m: los pies no patinan.
- **Diables de ola:** no persiguen el frente. Nace uno donde el frente pasa cada ~4 m de perímetro (cadena de 3–4 por lado, 2,5 s de
  vida, corren en el sentido del frente a paso humano y se deshacen). La ola se sigue leyendo como un relevo de diablos.
  Tope: `MAXD` sube a 14; si no hay hueco, la cadena salta uno (nunca roba a uno vivo).
- **Danza:** giros completos ocasionales (360° en 0,8 s) y saltos (raíz +0,25 m con caída), sin teatralidad; la forca sube en el giro.
- **Pruebas:** `__brasa` expone posición en el mundo por diablo; un script mide la velocidad media de 3 s → entre 0,8 y 3,5 m/s.
  Captura con `waveEvery=6`: la cadena visible en un muro.

## 3. Un poco de humo (nuevo bloque, después del aire)
El aditivo no oscurece: el humo es una capa **normal (alfa) oscura y apenas iluminada desde abajo**.
- 6 000 sprites grandes (0,8–2,5 m) analíticos en el vértice, como las llamas: nacen sobre el anillo donde hay calor, suben 3–8 m
  con deriva lenta y crecen; color = gris pardo muy bajo + luz cálida del anillo debajo (∝ calor local, cae con la altura); alfa ≤ 0,08.
  `depthWrite:false`, orden de render entre el suelo y las llamas.
- Densidad ∝ calor; más tras `awake` y en `reward` (el fuego que se apaga humea más); 0 con `leave` alto.
- Parámetro nuevo `smoke` (0–2, por defecto 1; 0 lo desactiva y no dibuja).
- **Pruebas:** captura progress 1 con y sin `smoke`; la banda 0,9–1,6 m no debe perder contraste (el humo sólo por encima del lecho).
  fps con turno: el coste debe ser < 1 ms; si no, bajar a 3 000 sprites o cortar el paso.

## 4. Barrido completo de `arrive` en 5 s, comprobado
- Script de evaluación (scratchpad) que, tras cargar, anima `window.__study3d.P.arrive` de 0 a 1 en 5 s (paso por frame con
  `requestAnimationFrame`) y toma capturas a 1, 2,5 y 4,5 s (tres ventanas de `check.mjs` con el mismo script y distinto tiempo
  de captura, porque cada ventana hace una sola captura).
- Contador nuevo en `__brasa`: `puffs()` (bocanadas de aterrizaje emitidas). PASA si las tres capturas muestran esquirlas cayendo →
  aterrizando → anillo encendido por tramos, y `puffs` > 100 al final.
- Lo mismo para `leave` 0 → 1 en 5 s (el fin debe ser negro: `object.visible` falso con leave = 1).

## 5. Una ola que cruza la costura P3 → P4, comprobada
- Script: fijar 2 manos juntas cerca del borde derecho de P3 (u ≈ 0,9 del último muro) con `PointerEvent` (shift), esperar la ola,
  capturar a 7196×912 a 1,0 y 2,0 s después. Recortes de 600 px a cada lado del borde de la tira (x 6596–7196 y 0–600), pegados
  uno junto al otro.
- PASA si el frente, el destello del lecho y el diablo pasan de un lado al otro sin salto ni duplicado (el lecho y el campo de calor
  usan el perímetro con `RepeatWrapping`, las chispas son 3D: no debería haber corte; se comprueba igual).
- Además: una mano arrastrada a través de la costura (manos virtuales de la demo, `group=1`): la estela sigue sin corte.

## Entregable
Part y JSON actualizados; capturas antes/después de 1 y 3; script y capturas de 4 y 5; fps (WebGPU y WebGL2) con turno;
`notas/3D-BR.md` al día; fila del tablero en «entregado» y respuesta de ≤ 3 líneas al director.
