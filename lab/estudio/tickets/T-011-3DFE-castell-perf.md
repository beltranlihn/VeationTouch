# T-011 · 3D-FE · castell: tronc/baixada ≥ 45 fps-eq en calidad alta

- **Dueño:** 3D-FE (único escritor de `scenes3d/parts/castell.js`) · **Mide:** QA (con ventana del director)
- **Respaldo:** `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/castell/castell.T-011-before.js` (la versión de antes)
- **Partida (QA):** tronc 30,2 ms → 33 fps-eq, baixada 30,4 → 33 (high: escala 1, MSAA 4); wait 13 ms → el castell cuesta ~17 ms.
- **Se respeta:** decisión del director (6,5 m, sin fit, densidad 1), las opciones por muro de INT (`buildPer`, `disPer`, `show`, `tilt`),
  el contrato y la coreografía. MSAA 2 sólo con permiso del director (vive en `res-obra3d/experience.js`).

## Criterio de PASA
tronc y baixada ≥ 45 fps-eq en high (instrumento de QA); capturas a resolución completa de tronc con 2 y 8 pisos, antes/después,
sin pérdida visible; sin errores; las opciones por muro siguen funcionando.

## Pasos (cada uno es un punto de corte seguro)
1. **LOD por visibilidad (hecho).** Cada castell se ve desde delante. Las partículas de la cara de atrás de cada cuerpo (normal contra
   el ojo, ndv < −0,3) llevan ~5 % de la luz (término `shell`): se conserva el 30 % con la energía ×1/0,3. La mitad trasera de la
   pinya (detrás del tronc): 45 %. Se reordenan los buffers: delante primero. 160k → 105k partículas dibujadas por castell.
2. **Oclusor sólo con las de delante (hecho).** Segunda geometría que comparte los mismos buffers, `instanceCount` = sólo las de
   delante (71k en vez de 160k). Las de atrás no tapan nada que no tapen ya las de delante.
3. **Aura más barata (hecho).** Los sprites anchos (9× tamaño, 81× área) eran el 4,5 % de las partículas y ~3,6× el área de todas las
   demás juntas: ahora 1,5 % con 3× la luz (misma luz total, un tercio del relleno).
4. **Esfera de recorte más ajustada (hecho):** radio top/2 + 4 (era + 6), para que los muros vecinos no dibujen el castell de al lado.
5. *Si QA mide < 45:* (a) KEEP_BACK 0,3 → 0,2 y pinya trasera 0,45 → 0,3; (b) tamaño de partícula mínimo en píxeles para las del
   anillo exterior lejano; (c) pedir al director MSAA 2 en high.

## Pruebas
- `check.mjs` res-obra3d, `score.jump('tronc')` con `floors` fijado a 2 y a 8 (eval `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/castell/tr2.js`, `tr8.js`), 7196×912.
- Comparación `/private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/castell/zoom_f2.png`, `zoom_f8.png` (izquierda antes, derecha después; recorte P4 a resolución completa).
- fps: QA, bench de res-obra3d en tronc y baixada, high.
