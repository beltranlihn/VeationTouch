# T-041 · 3D-FE · III. Tronc = LEVANTAR y NIVELAR (PLAN-INTERACCION §2 paso 2; propuesta §4.4) — EN PAUSA hasta el paso 0 de ENT

- **Dueño:** 3D-FE · **Archivos:** `parts/tronc3d.js` (respaldo previo `scratchpad/tronc/tronc3d.T-041-before.js`), `res-3d-study/parts/tronc3d.json`.
  La partitura (`score.js`, sus dos copias) es de ENT; la guía, de GUI; el sonido, de ENT.
- **Lado visual** (detrás de `lift`; con `state.yMed` presente se activa solo):
  1. **La banda de hombros** en cada muro del castell, justo detrás del plano del muro y en el marco de la SALA (no sube con el mundo): una línea hueso, un halo
     y 18 esquirlas esmaltadas, de 2,6 m de ancho. Sigue a `state.yMed[w]` con un muelle rígido, sin retraso añadido, y se inclina con `yL − yR`.
  2. **El piso sube con las manos**: el piso en formación espera 1,1 m por debajo de su sitio y sube con el progreso (`floorProgress` = el ascenso de la frase).
     Arriba, el encaje que ya existe (peso + destello) y un destello en la banda. El nombre del piso lo pone GUI.
  3. **Nivelar**: `lean` del score (o, en el estudio, el de `yL − yR`) → la inclinación física que ya existe (±7°, las piezas resbalan).
  4. **El temblor** (`wobble`): la torre se va a un lado, el piso cruje (destello, sonido `ceramic/break`), tiembla y el pie se enciende. Con `steady`, golpe grave
     y alivio (hundimiento y destello de todos los pisos). Con `slip`, el piso de arriba cae (sus piezas, con física); la torre no se derrumba y el piso
     se vuelve a formar a los 2,6 s.
  5. Sin el pulso como evaluación: en el modo lift desaparecen la respiración y el hundimiento con el timbal.
- **Pendiente** (tras el paso 0): los nombres reales de los campos (`yMed`, `yL`, `yR`, eventos `lift`, `level`, `wobble`, `steady`, `slip`), la banda tenue
  de los muros sin torre («la plaça», cuenta la mitad), las manos fantasma (GUI), y la nota del director de arte (con 1–3 pisos, la torre estrecha y los pisos bajos muy oscuros).
- **Prueba que sabe fallar:** con el público virtual de manos quietas la banda no sube y el piso tampoco; con manos que suben, sí. Con un lado más alto, la banda y
  la torre se inclinan. Con wobble sin manos abajo durante 5 s, cae un piso (y sólo uno).
- **Volver atrás:** copiar el respaldo encima.
