# Laboratorio de experiencias — para Vicente

Aquí creas **obras interactivas y demos** para las salas inmersivas con VEATION Touch (cuatro muros, manos detectadas por LiDAR, sonido
4.1), trabajando con Claude Code. **No tocas el software**: sólo esta carpeta, `lab/`. Lo que hagas se guarda en un catálogo y el estudio
lo integra después en la app y en el perfil de la sala.

## Cómo empezar

1. Abre una terminal en la carpeta del repositorio (`Interactive System Veat`) y trabaja en **tu propia rama**:
   ```
   git switch -c lab/vicente        # la primera vez
   git switch lab/vicente           # las siguientes
   ```
2. Una sola vez: `npm install` en la raíz (sólo hace falta para las capturas automáticas).
3. Arranca Claude Code en esa carpeta:
   ```
   claude
   ```
   Claude lee `CLAUDE.md` de la raíz y el de `lab/` (las reglas, la API y la escala humana). Empieza siempre con: «Lee `lab/CLAUDE.md`».
   No hace falta explicarle la sala.
4. Cuéntale la idea con tus palabras. Claude levanta el laboratorio y te dice la dirección (normalmente `http://localhost:8780/`).

## Qué pedirle

- **Una idea rápida para ver y oír:** «Haz un prototipo de agua que responde a las manos, con notas en pentatónica, para ver hoy.»
- **Pasar un prototipo a experimento listo para la sala:** «Convierte `<id>` en un experimento listo para el runtime.»
- **Comprobar a escala humana:** «Revisa que todo cae entre 0,9 y 1,7 m y que funciona con una persona y con un grupo.»
- **Probarlo como en la sala:** «Pruébalo con la sensación LiDAR y con la costura entre P3 y P4.»
- **Una pieza de sonido:** «Haz una pieza de sonido ambiental en do menor, sin samples, que suene en el muro que se toca.»
- **Dejarlo presentable:** «Haz la captura, escribe el `NOTES.md` y actualiza el catálogo.»

## Qué verás y qué teclas hay

Mueve el ratón: **el ratón es una mano**. Si no tocas nada durante 4 s, entran manos virtuales a velocidad humana.

| Tecla | Hace |
|---|---|
| clic / arrastrar | una mano · **Shift+clic** fija una mano (otro Shift+clic la quita) |
| **F** | muestra los 4 muros, la costura y las manos |
| **B** | escala corporal: adulto 1,70 m, niño 1,20 m, alcance 0,8–2,0 m, techo de 3,0 m |
| **D / G** | manos virtuales sí/no · grupo de 1, 2, 4 u 8 |
| **L** | «sensación LiDAR»: 10 lecturas por segundo, pérdidas y 150 ms de retraso, como el sensor real |
| **S** | sonido 4.1 simulado (medidores de los 4 muros y del sub abajo a la derecha) |
| **P** | panel de parámetros |
| **H** | ayuda |

## El catálogo

`lab/CATALOG.md` es el índice de todo lo que hay, con su estado. Cada experimento vive en `lab/experiments/<id>/` con su `manifest.json`,
su `NOTES.md` (concepto, camino en solitario, camino en grupo, audio, estado, peticiones al estudio) y su `preview.png`. Las plantillas
(`_template`, `_template-sound`, `_template-prototype`) se copian, no se editan. Ábrelo en el navegador desde el índice del laboratorio.

## Guardar y compartir

Claude hace los commits **sólo de `lab/`** en tu rama `lab/vicente` y, cuando haya algo presentable, abre un *pull request*. Si algo falta
en el sistema (una función, un parámetro), Claude lo apunta en el `NOTES.md` como petición al estudio: **no lo parchea**.

No se suben secretos ni archivos de más de 20 MB (vídeo, audio pesado): esos van al Drive del estudio.
