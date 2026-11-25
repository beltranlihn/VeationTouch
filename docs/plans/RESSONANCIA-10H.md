# Ressonància — para Beltrán a las 10:00 (25-11-2026)

## Estado

- La obra está integrada en **`main` 7db8b78**, con push.
- El trabajo del estudio está en la rama `lab/ressonancia-studio`, commit 003dfa5, parte de lo de Vicente (7a056a2). Son unos
  330 commits.
- **Verificación final:**
  - la batería del arnés pasó 17 de 17;
  - el álbum del «después» salió 14 de 14 sin errores;
  - el paso natural espera → intro → Brasa tiene como peor fotograma 50 ms;
  - la obra renderiza con el motor real de la app sin errores.
- **El servidor de la sala (SMODE-CLIENT2) estaba DESCONECTADO desde ~01:30.** Le dejé la fase 2 en su bandeja. Si no la hizo,
  sigue los pasos de abajo: unos 15 minutos.

## Instalar en el servidor, si no lo hizo el agente

1. Copiar `%APPDATA%\VEATION Touch` al Escritorio como respaldo.
2. Cerrar VEATION (Resolume sigue abierto). En el repo: `git fetch origin`, `git switch main` y `git pull --ff-only`. Debe quedar
   en 7db8b78.
3. Ejecutar `npm run dist` y abrir `dist\win-unpacked\VEATION Touch.exe`. No usar el instalador. La versión de Program Files
   sirve para volver atrás.
4. En Live, crear un preset con:
   - visual: «Ressonància — the whole work in 3D» (`res-obra3d`), Quality High, Go to «—»;
   - sonido: «Ressonància — sound», voz «es».

   `ressonancia` y `res-3d-study` son módulos de apoyo y no se lanzan.
5. **Cargar la obra un par de minutos antes de que entre el público.** Al cargar hay un fotograma largo, de unos 9 s, que es
   normal. No recargar delante del público. Usar «Go to» sólo en ensayos: al saltar hay un tirón de unos 3 s.

## Qué cambió respecto a la versión de Vicente

| Qué | Cómo queda |
|---|---|
| Relato | Lo que hace el público cambia el castell: dos finales por bloque y la colla que ayuda, siempre nombrada. Nada se cierra en silencio por reloj, y la obra avanza aunque la gente tarde |
| Interacción | Se posa la mano unos 0,5 s sobre objetos del mundo: braseros, columnas de fuego y de luz, sillares, palmas, manos en el acta. Hay momentos libres. Funciona igual con 1 que con 15 personas y un niño llega a todo |
| Personajes | Cuerpos de partículas 3D sacados de mallas humanas CC0 (Quaternius) |
| Mundo | La plaza real de noche con luz distinta en cada capítulo: luna, fuego, fiesta, focos cruzados, Pom casi a oscuras, estallido de oro, ondas de oro y hora azul. La arquitectura se rompe y se rearma en 3D |
| Voz | 45 líneas nuevas con la voz de Vicente, que suenan en el muro donde pasa la acción |
| Texto | La serif de las cartelas para todo |
| Sonido | Lo generativo va en la tonalidad real de cada capítulo |
| Técnica | El visor no duplica sonido, el manifiesto tiene 56 parámetros, la obra no tiene tirones en el paso natural y la fiesta está aligerada |

Dirección y análisis: `docs/research/ressonancia-direccion/`. Están ahí `00-direccion.md` (las reglas que fuiste dando) y
`05-plan.md`. El álbum «antes» y «después» está en `lab/estudio/album-studio*/` de la rama del estudio.

## Lo que sólo se puede comprobar en la sala

1. **El sonido.** Nadie lo ha oído: todo se validó con números. Hay que revisar:
   - volumen de la voz sobre la música;
   - que cada toque suene una sola vez con el visor abierto;
   - los graves sin sub;
   - que P2 y P3 comparten canal.
2. **fps reales en la A6000** a escala 1 con Spout. El bloque más pesado es la fiesta. Si algún bloque baja de 50 fps, poner
   Quality en Medium.
3. **Altura de la imagen.** El perfil dice 3,5 m y la imagen mide 3,75. Comprobarlo con el Verify de la calibración, poniendo una
   mano a 1,25 m.
4. **Luz en proyector.** El acta es clara y puede lavar los muros de enfrente: tener a mano `exposure`.
5. **Movimiento.** La respiración de los cuerpos, la subida del oro en la coronación y la costura P3→P4 en la onda de oro.
6. **Umbrales con LiDAR real.** Están en el panel P; el preajuste «sala» es más tolerante.

## Pendientes menores (no bloquean)

- En la caída, «Manos al muro» cruza la base de la torre.
- La línea de valores del acta es discreta.
- Al cargar la obra hay un fotograma largo de 9 s.
