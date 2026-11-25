# Ressonància — comparar las dos versiones en la sala (25-11-2026)

Beltrán quiere ver en la sala la obra entera en las dos versiones y elegir una:

| Versión | Rama | Qué es |
|---|---|---|
| **Estudio** (la nueva) | `main` 5a09587 | Lo que se hizo la noche del 24 al 25: plaza de noche, cuerpos de partículas, dianas, voces nuevas |
| **Vicente** | `ressonancia-vicente` a3325a0 | La obra tal como la entregó Vicente (`lab/vicente` 7a056a2), sin cambios |

El software es el mismo en las dos ramas. Sólo cambian las cuatro carpetas de la obra (`res-obra3d`, `ressonancia`, `res-3d-study`,
`ressonancia-sound`). Las dos usan la misma calibración y el mismo perfil, que están en `%APPDATA%\VEATION Touch`.

## Preparar las dos (≈ 15 min, una sola vez)

1. **Respaldo:** copiar `%APPDATA%\VEATION Touch` a `%USERPROFILE%\Desktop\VEATION-backup-<fecha>\`. No abrir `settings.json`.
2. Cerrar VEATION. Resolume sigue abierto. Ejecutar `git fetch origin`.
3. **Versión de Vicente:**
   1. `git switch ressonancia-vicente`
   2. `npm run dist`
   3. Mover `dist\win-unpacked` a `%USERPROFILE%\Desktop\VEATION-Vicente\`.
4. **Versión del estudio:**
   1. `git switch main`
   2. `git pull --ff-only`. La obra es la de 5a09587; los commits posteriores sólo cambian documentación.
   3. `npm run dist`, que deja el programa en `dist\win-unpacked\`.

`package.json` no cambia, así que no hace falta `npm install`. No se ejecuta ningún instalador.

## Mostrar cada una

- **Estudio:** `dist\win-unpacked\VEATION Touch.exe`
- **Vicente:** `Desktop\VEATION-Vicente\VEATION Touch.exe`

Se abre **sólo una a la vez**, porque usan los mismos puertos y el mismo Spout «VEATION Touch» que lee Resolume. Para cambiar de versión,
se cierra la app del todo y se abre la otra.

En las dos, en Live:
1. Visual: «Ressonància — the whole work in 3D» (`res-obra3d`), con Quality en High y Go to en «—».
2. Sonido: «Ressonància — sound», con la voz «es».
3. Lanzar y esperar a que compile, unos 15 s en negro.

Para recorrer las etapas en un ensayo se usa **Go to** en el panel de la visual; al saltar hay un tirón de unos 3 s. Al terminar, volver
a dejar Go to en «—».

**Sólo en la versión de Vicente:** ocultar la vista previa de la experiencia en Live, con el botón **Experience** junto a Points.
Con la vista previa abierta, cada golpe suena dos veces. En la del estudio esto está arreglado.

## Después de elegir

- **Si gana la del estudio:** se queda `dist\win-unpacked` y se puede borrar `Desktop\VEATION-Vicente`.
- **Si gana la de Vicente:** se usa `Desktop\VEATION-Vicente` y se avisa al estudio, que deja `main` con esas carpetas y añade el
  arreglo del sonido doble.
- **Si gusta una mezcla** (por ejemplo, partes abstractas de Vicente con lo nuevo): apuntar qué etapas de cuál. Se decide con calma,
  no en la sala.
