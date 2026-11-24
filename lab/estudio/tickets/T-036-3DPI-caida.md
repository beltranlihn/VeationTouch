# T-036 · 3D-PI · La caída re-hecha para el mundo nuevo (fall3d)

- **Dueño:** 3D-PI (fall3d pasa de INT a 3D-PI, director 13:05) · **Plazos:** visible 16:30 · QA 18:30.
- **Archivos:** `ressonancia/scenes3d/parts/fall3d.js`, `res-3d-study/parts/fall3d.json`, `notas/3D-PI.md`, mi fila de TABLERO.
- **Respaldos:** `parts/fall3d.ARTE2.js.bak`, `res-3d-study/parts/fall3d.json.ARTE2.bak`. Volver = copiar encima.

## Qué
La torre-ensamblaje de tronc3d (3D-FE) cae físicamente; fall3d dirige y añade materia:
1. **Qué torre**: carregat (desde la bajada) = la torre en pantalla (`ctx.parts.tronc3d` visible) → `collapse({ mode, duration })` al
   empezar el bloque. intent (tras el Pom, sin torre) y el estudio = una tronc3d **privada** de fall3d (los pisos del grupo, los muros de
   la estructura) que se ensambla desde sus fragmentos en 1,5 s y cae en el resto.
2. **Encima**: cada piso que se suelta lanza esquirlas grandes de cerámica esmaltada (platos rotos irregulares con bisel, clearcoat sobre
   `room.envMap`) con gravedad, giro y aterrizaje en lo que queda en pie (intent) o en la plaza (carregat); un golpe fuerte las **parte**
   en 3 teselas que rebotan; cada golpe levanta **polvo** que sube despacio y se aclara; el borde caliente se enfría oro → brasa → negro.
3. **Final digno**: desde duración − 3 s todo baja a negro, despacio, para el acta.
4. **Sonido** (ENT › Ola 2 y «Sonido de los capítulos rehechos»): piso que se parte `stone/break`, esquirlas `ceramic/floor` y `ceramic/break`
   (≤ 3/s); los impactos de las piezas de la torre ya los emite tronc3d.

## Pasos / corte seguro
1 respaldos + ticket · 2 fall3d nuevo con torre privada + esquirlas + polvo (estudio) → **corte seguro** · 3 obra: intent desde pom y
carregat desde baixada · 4 notas, capturas, QA.

## Prueba
Estudio `?part=fall3d` (t = 0,5 / 2 / 4 / 6 / 9 / 11,5, intent y carregat); obra `review.html?people=6` saltando a `fall` desde pom (intent)
y desde baixada (carregat); WebGPU y WebGL2 sin errores.

## Riesgo conocido (para 3D-FE)
`tronc3d.collapse()` deja `col.on = true` hasta un `restore()`: en el pase siguiente el tronc seguiría «cayendo». Pedido: que tronc3d
haga `restore()` solo cuando su bloque vuelva a ser `tronc` (o al resetear), porque fall3d no recibe updates cuando la torre se va.
