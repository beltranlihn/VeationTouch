# T-070 RND — TAA fantasma (figuras en movimiento translúcidas)
Estado: HECHO (sin commit) · 25-11 · room3d.js (backup room3d.T070.js.bak), PARTS.md (docs)
Causa: el resolve TAA (sin velocidades) recortaba la historia en HDR lineal: una chispa en el 3×3 abría la caja y el fondo de antes
sobrevivía al 88 %; además los diables tienen cuerpo punteado sobre suelo con ondas → la caja siempre contiene cuerpo y fondo.
Arreglo: (1) clip en espacio tonemapped c/(1+max) + YCoCg, caja media±σ ∩ min/max, clip hacia el centro; (2) máscara REACTIVA opt-in:
room.reactive(obj) → capa 30, se pinta otra vez sola a media resolución; donde la máscara de este frame o del anterior cubre, la
historia cae (0.85). Pass omitido si nada reactivo es visible. Nada se asigna por frame.
Pendiente (partes, no RND): brasa3d.js tras createDiables: `for (const m of DIA.meshes) room.reactive?.(m);` (+ sparkMesh); entrada: las teselas que caen.
Verificación: /private/tmp/claude-501/-Users-vicentemanzano-Desktop-INTERACTIVE-EXPERIENCES/0aac3285-443e-4d3b-aece-2f1b4c394a37/scratchpad/taa/crop_brasa_taa_before.png (fantasma) · crop_brasa_msaa.png · crop_brasa_taa_v2.png (opt-in vía eval: sólido) ·
crop_entr_taa_vs_none.png (bóveda: TAA arriba suave, none abajo dentado). npm run check verde, errors [].
