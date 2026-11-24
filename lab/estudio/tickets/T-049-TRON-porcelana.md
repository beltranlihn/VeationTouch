# T-049 · TRON · Tronc = el castell como escultura de porcelana

- **Dueño:** TRON · **Origen:** ARTE-3.md §4 (aprobado por Vicente 24-11) · «se ve muy dark y glitchea mucho, la referencia no es la indicada».
- **Archivos:** `scenes3d/parts/tronc3d.js` (+ `parts/tronc3d/`), `res-3d-study/parts/tronc3d.json`, `notas/TRON.md`.
- **Respaldo:** `parts/tronc3d.T049.js.bak`, `res-3d-study/parts/tronc3d.T049.json.bak` (volver = copiarlos encima).

## Qué
1. **La escultura.** Un castell real de cuerpos humanos (pinya, folre, baixos…sisens, dosos, acotxador, enxaneta; la disposición de
   `castell.js`), modelado como SDF y mallado (surface nets): **porcelana blanca mate**; único color, las **faixes en trencadís
   esmaltado**. Una torre por muro de la estructura, grande y centrada; luz de museo (llave cálida arriba, filo frío, relleno bajo, halo
   radial detrás) sobre **fondo gris azulado medio**. Una malla por piso, la misma geometría en los cuatro muros.
2. **Regla de pisos** fina en mono al lado (BAIXOS · SEGONS · TERÇOS…) que se marca al encajar (si SIS no da regla en PARTS.md).
3. **Levantar:** el piso que se forma es granos que suben con la banda de hombros y se solidifican al encajar (disolución al revés).
4. **Tocar:** la mano disuelve en granos la porcelana donde toca (misma erosión para sólido y granos, en posición de reposo,
   suavizado 16/8/4 por s); vuelven al soltar.
5. **Inclinarse:** la escultura se inclina (lean[w]) y suelta granos por el lado que cae; recta, vuelven.
6. **Temblor:** una grieta fina y luminosa en la porcelana; `steady` la cierra.
7. **Muros sin torre:** granos que van por el pie del muro hacia la torre más cercana.
8. **API intacta:** collapse/restore/collapsing, takeFloor/giveFloor/levels, impacts → fx:impact, rise; decor fuera del bloque.
9. Zonas de silencio (texto ±1,6 m × 1,75–2,2 m; botón ±0,9 m × 0,9–1,6 m) ≤ 35 % de luminancia.

## Prueba
`res-obra3d?sound=ressonancia-sound&demo=0` (0, 1, 4 manos; P «Go to» tronc), `res-3d-study?part=tronc3d`; WebGPU y WebGL2, 0 errores;
baixada (takeFloor) y fall (collapse) siguen funcionando. Sin commits.
