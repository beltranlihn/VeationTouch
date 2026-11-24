# T-034 — INT · La plaza de la intro: materia física y su rotura en teselas de imagen

Fuente: director 24-11 (tras T-028); `ARTE-2.md` §3 (intro: azul noche, ámbar de farol; la plaza que se rompe en teselas de píxel e
iridiscencia, refs. 13/14), §4 (materiales físicos con mapa de entorno). Dueño: INT. Archivos: `parts/plaza.js`,
`res-obra3d/experience.js`, `scenes3d/room3d.js` (y notas). Respaldo: `plaza.ARTE2.js.bak`.

## Pasos (cada uno, punto seguro de corte)
1. **Materiales con `room.envMap`**: losas mojadas con reflejo de entorno real (metal 0, rugosidad baja y variable por charco,
   `envMapIntensity` bajo para no lavar la noche), vidrio de ventanas (reflejo del cielo encima del interior iluminado), hierro de
   balcones (metal oscuro con brillo), espejos de la rotura (cromo). Sin cambiar el conjunto de luces.
2. **Luz más rica**: el reflejo de entorno tintado por el cielo nocturno + el halo de las farolas; la paleta de la intro (azul noche,
   ámbar de farol) sin pasarse de ámbar.
3. **La rotura (46–58 s) como la sala desgarrándose en teselas de imagen**: el anfitrión usa la misma composición de T-028: la
   imagen de la plaza (pasada `out`) se rompe en losas que llevan la imagen, sobre lo que queda detrás (aire, título). La plaza deja
   de hacer su rotura de paneles flotantes en la intro (`params.noBreak`): se queda entera hasta que las teselas se la llevan; luego
   se oculta. Fuera de la intro (Tronc, bajada, caída) la rotura de siempre sigue igual.
4. Paleta: intro azul noche + ámbar; en la bajada la plaza sigue el guion de color (rosa/lila del amanecer en el cielo).

## Cómo volver atrás
`plaza.ARTE2.js.bak`; `params.env = 0` apaga el entorno en la plaza; `?tiles=0` devuelve la rotura de paneles en la intro.

## Prueba
Capturas de la intro a t = 30 (plaza en reposo: reflejos) y t = 48 / 51 / 54 (rotura en teselas), WebGPU y WebGL2, 0 errores;
`scratchpad/int/t034/`.
