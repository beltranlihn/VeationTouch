# T-061 — FIX · QA interacción de la entrada (bloque `wait`)

Dueño: FIX · Encargo del director, 25-11 (cambio de alcance: el error de Pom y el barrido de bloques quedan **aparcados**; no se
tocó `pom3d.js` ni ningún otro archivo de la obra). Estado: **hecho** (sólo pruebas; sin commit).

## Cómo
Ventana oculta de Electron (silenciosa) sobre el servidor 8780, `res-obra3d/index.html?demo=0` (+ `&lidar`), manos por
`__labRoom.stage.put/lift`, latencia medida leyendo el canvas fotograma a fotograma, contadores de `umbral3d.debug()`.
Secuencias en `scratchpad/entrance-qa/{solo4,four,lidar,nolidar}/`. Álbum: `album3/c1-wait-idle.png`, `c2-wait-revealed.png`,
`c3-wait-close.png` (muro P1 a escala 1).

## Resultados
| Punto | Medida | |
|---|---|---|
| Respuesta al posarse (vuelta + ola + piezas fuera) | 10–60 ms sin L (1.er fotograma); 7 ms con 4 manos jugando | PASA |
| Ídem con L | 130–220 ms (es el sensor simulado: 10 Hz + 150 ms) | PASA (sensor) |
| Pintar al moverse | 270 piezas en 2,2 m (sin L); 150 con L (la mitad) | PASA / mejorable con L |
| Cascada al quedarse 0,6 s | 620–700 ms | PASA |
| Olas que se cruzan (2 manos) | visibles; 443 cruces | PASA |
| Revelado solo | tocando ~20–35 s; **sólo pintando sin levantar: ~50 s** | PASA justo / FALLA con «pintor» |
| Revelado con 4 | 0→1 ≈ 18 s (0,23→1 en 15,5 s) | PASA |
| Botón que se condensa | polvo 35 % → mano 50 % → vidrio 90 % | PASA |
| Mantener el botón | 1 mano 4,56 s; 2 manos 3,07 s; arco de progreso visible; el texto se desvanece | PASA |
| start → intro | onda + puerta que se abre + atardecer 1 s + teselas | PASA con notas |
| Restos | todo vuelve a su sitio en ≤ 10 s sin manos | PASA |
| Mano quieta con L | 4 aterrizajes falsos en 8 s (id nuevo tras el corte): ola + piezas fuera + golpe cada ~2 s | FALLA |

## Propuestas (para los dueños)
1. **umbral3d.js** (ENT), ~l. 943 `if (fresh) land(...)`: no tratar como fresca una mano nueva a < 0,15 m de una que se fue hace
   < 0,5 s (usar `HOLD`: `o.seen`, `o.cu/cy`) → la mano quieta con LiDAR deja de «golpear» cada 2 s. No tocar el host (Tronc
   necesita las repulsas reales).
2. **score.js** (wait, l. 341): que moverse también revele: `+ dt * R.move * min(1, speed/0.3)` por mano, `reveal.move: 0.03` → el
   «pintor» solo revela en ~20 s en vez de ~50 s.
3. **umbral3d.js** `doorK` (l. ~303): en el start, con `uDoor` hasta ×4,2, la jamba recta corta el mosaico en **líneas verticales
   limpias** (se ve como cartón, no trencadís): sumar a `x` un jitter por pieza (hash de `wc`) × `uPush/2.8` (±0,12 m).
4. **arches.js** (ARC): en P4, P1 y P3 el anillo del botón (r 0,39) toca la cara interior derecha del arco (abocinado de 20°
   visto de lado); bajar `SPLAY` a ~12° o abrir `door.a` a 0,8 (umbral3d `DOOR_A` igual).
5. Menor: «MANTENED» bajo la mano del vidrio apenas se lee (GUI); con L, pintar a lo largo del segmento entre lecturas (ENT).
