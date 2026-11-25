# T-060 — TRN · Luz de la espera: bloom del mediodía + rampa espera → intro

Dueño: TRN · Encargo del director (ART, ARTE-ENTRADA §b), 25-11. Estado: **hecho, para QA** (sin commit).

## Qué
1. **Bloom por bloque** desde el anfitrión (`room.setBloom` existente, cada frame, sólo uniforms): `wait` = 0,07 en pantalla
   (0,14 × BLOOM_K) con umbral 1,0; el resto como antes (P.bloom, 0,85). Al salir de la espera el bloom nocturno no vuelve hasta
   que el umbral está oscuro (dusk.t ≥ 2,3 s); al entrar en la espera baja en ~0,3 s.
2. **Rampa espera → intro (2,9 s, nunca un corte)**: mediodía arena → atardecer cálido (cielo #C98F6A a 1 s) → azul noche de la
   intro (1,2–2,6 s) → oscuro (todo el umbral ×0,04 a 2,9 s). Sol y relleno de umbral3d enrojecen (×0,5 a 1 s) y se apagan a 2 s;
   las teselas esmaltadas (llevan luz propia) son lo último que se va. Las teselas de la transición esperan 1 s (`tr.delay`) al salir
   de la espera: cuando empiezan a girar ya llevan el atardecer, no el mediodía.

## Cómo (barato)
Dos esferas de multiplicar (CustomBlending dst×src, un draw por muro, sólo mientras corre la rampa) colgadas del rig de umbral3d:
los pases de teselas las aplican **sólo al mundo saliente**; la noche que entra no se toca. `far` (r 11,5 m, con depth test) = cielo,
bruma, dunas; `all` (r 1,5 m) = todo el umbral. Sin pases nuevos, sin tocar room3d.js ni umbral3d/arches/guide3d.

## Archivos
`res-obra3d/experience.js` (backup `experience.T060.js.bak`). Capturas: `album3/tw-1…tw-5.png` (dusk.t 0,3 / 1,0 / 1,6 / 2,2 / 2,9 s).

## Pruebas
`npm run check` 90/90 · check.mjs index + review `errors: []` · tras la transición: esferas ocultas, colores de las luces restaurados,
bloom 0,6/0,85. Nota: la carga de res-obra3d tarda hoy 17–19 s (igual con el host anterior: contención, no T-060); las capturas se
hicieron con una copia del check con límite de 45 s en el scratchpad.

## Para QA
fps del frame de la rampa (2 draws extra por muro sobre la tira). Para ENT (opcional): si se quiere que el esmalte brille un poco
más en el oscuro, un `params.dusk` 0..1 en umbral3d que suba su emisivo de esmalte; hoy no hace falta.
