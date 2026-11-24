# T-021 · 3D-PO · III. Tronc — Equilibri: «Piedra y cerámica» (parte nueva `tronc3d`)

- **Dueño:** 3D-PO · **Revisa:** QA · **Integra:** INT (junto a plaza + castell en el bloque tronc) · **Plazo:** 02:30
- **Archivos (sólo estos):** `scenes3d/parts/tronc3d.js`, `res-3d-study/parts/tronc3d.json`, `lab/estudio/notas/3D-PO.md`.
  No se tocan castell.js, plaza.js ni res-obra3d.
- **Guion:** GUION.md › III. Tronc: «el trencadís: torres que suben piso a piso sobre los muros sostenidos, de la piedra y el hueso a la
  terracota y al rojo»; al final «el trencadís se apaga hacia abajo y arriba se abre la noche».

## Qué hace
- Cada piso que se fija (`state.floors`, `floorProgress`, evento `floor`) recibe una FAIXA de trencadís: un cinturón de teselas de
  cerámica esmaltada alrededor de los cuerpos de ese piso. Mientras el piso se forma (`floorProgress`) sus teselas flotan cerca,
  girando, cada vez más cerca; al fijarse vuelan a su sitio, encajan con un destello y quedan.
- Color por piso: piedra, hueso, ocre pálido, arena, terracota clara, terracota, terracota oscura, rojo, rojo profundo.
- Sigue al castell: copia cada frame la matriz del grupo del castell de su muro (`ctx.parts.castell.castells[w].grp`), así que se
  inclina con `lean[w]` y tiembla con `weak[w]` exactamente como él. Sin castell (estudio), misma regla de colocación (6,5 m tras el muro)
  e inclinación/temblor propios desde los parámetros.
- Premio (`phase 'reward'`): el trencadís se apaga de arriba abajo.
- arrive: las teselas de los pisos ya fijados llegan volando desde fragmentos dispersos; leave: suben y se separan y se apagan.

## Pruebas (PASA)
Tableros de estudio con floors 1/3/6/9, con lean, con weak y con reward; costura; WebGPU y WebGL2 sin errores (capturas después de las 00:10).
