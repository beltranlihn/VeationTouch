# Tablero

Estados: `en curso` · `entregado` (espera QA) · `PASA` · `FALLA` (vuelve al dueño) · `bloqueado`. Cada rol edita sólo sus filas.

## Ola 1 — cimientos (hecho)
| Id | Dueño | Tarea | Estado | Evidencia |
|---|---|---|---|---|
| T-000a | director → INT | Base 3D: Three.js r187, CAVE de 4 cámaras, manos en el plano del muro | PASA (falta: el bloom no envuelve la costura P3→P4, lo arregla INT antes de las 23:40) | `res-3d`, 60 fps WebGPU y WebGL2 (M1 Max) |
| T-000b | director | Intro 3D (plaza, atmos, castell, texto) | entregado | `res-intro3d`; 51 fps en media (M1 Max) |
| T-000c | director | Sonido nuevo + voces EN / ES | entregado | `ressonancia-sound`; niveles medidos, nadie lo ha escuchado |

## Ola 2 — piezas (capítulos 3D) · plazo 23:15 (replanificado: la sesión se cerró a las 19:53 y los agentes se reanudaron a las 22:20)
| Id | Dueño | Tarea | Criterio de PASA | Estado | Evidencia |
|---|---|---|---|---|---|
| T-001 | 3D-BR | `parts/brasa3d.js` | sin errores; ≥ 50 fps a escala 1 sola (con turno de GPU); llegada y salida por fragmentación; respuesta de mano < 100 ms; captura revisada | PASA | QA 23:27: salida re-comprobada, 91 fps-eq, costura 5,8, sin errores; no bloqueante: banda de la cama muy brillante con 15 manos |
| T-002 | 3D-PI | `parts/pinya3d.js` (+ T-007, T-012, T-016 materia) | ídem; cuerpos que se leen como personas a 3–6 m | entregado | T-016: materia oscura (tronco 93→52 = 56 %), borde de perla, charco de luz y sombra de contacto, manos y caderas; banda fill1 33–34, closed 46–49; sin errores WebGPU+WebGL2; `notas/3D-PI.md` |
| T-003 | 3D-PO | `parts/pom3d.js` | ídem; la subida se siente (paralaje) | PASA | QA 23:35 (re-comprobación de la salida): banda de la guía ≤ 37 de leave 0,02 a 0,8 (salto máx. 11); WebGL2 igual; fragmentos oscuros con grietas de oro, sin destello. No bloqueante: entre 0,06 y 0,12 la ciudad y las nubes desaparecen de golpe de los fragmentos |
| T-004 | 3D-FE | `parts/festa3d.js` | ídem; 2 manos: ondas claras; 15: no se satura | PASA | QA 22:45: sin errores WebGPU/WebGL2; 112 fps-eq (15 manos 93); mano 1 frame; costura y esquinas continuas; notas/QA.md › T-004 (3 mejoras no bloqueantes) |
| T-010 | 3D-FE | festa3d: bandas calmas, grietas irregulares, WebGL2 ≥ 50 fps con 15 manos (`tickets/T-010-3DFE-resonancia.md`) | ver ticket | PASA | QA 23:32 (T-010b): sin la mancha de P2 en ningún estado a resonancia 0; bandas sólo con resonancia alta, sin verde; sin errores WebGPU/WebGL2; caps/festa10b/patch_cmp.png |
| T-009 | 3D-BR | brasa3d: esquirlas losa piedra/espejo, diablos a paso humano, humo, barrido de arrive 5 s, ola por la costura (`tickets/T-009-3DBR-fuego.md`) | ver ticket | PASA | QA 23:27: salida re-comprobada, 91 fps-eq, costura 5,8, sin errores; no bloqueante: banda de la cama muy brillante con 15 manos |

## Ola 3 — integración · primer hito 23:00 · completo 23:45
| Id | Dueño | Tarea | Criterio de PASA | Estado | Evidencia |
|---|---|---|---|---|---|
| T-005 | INT | `res-obra3d`: la obra entera en 3D con el director, transiciones por fragmentación, guía 3D, Tronc/bajada/caída con castell + plaza, acta 3D, página de revisión con público virtual y sonido | un pase completo de la espera al acta sin errores (prueba de humo); cada bloque con su mundo; transiciones cruzadas | PASA | QA 23:40: 11 tramos sin errores; cada bloque con su universo; transiciones por fragmentos; guía legible; ≥ 56 fps-eq en media. Pendiente: pom→crown 2,5 s en negro tras el salto (re-comprobar en pase real); alta: tronc/bajada 37–38 (T-011 paso 5 en medición) |

## Ola 4c — rendimiento
| Id | Dueño | Tarea | Criterio de PASA | Estado | Evidencia |
|---|---|---|---|---|---|
| T-011 | 3D-FE | Rendimiento del castell en calidad alta (tronc/bajada ≥ 45 fps-eq en M1 Max sin perder el aspecto); 3D-FE es el único escritor de `castell.js` | ≥ 45 fps-eq medido por QA; capturas antes/después iguales a ojo | PASA | QA 23:56: alta tronc 49–50 fps-eq, bajada 46 (antes 33), castell igual a ojo; MSAA 2 en alta; tickets/T-011 |

## Ola 4 — pruebas · continuo
| Id | Dueño | Tarea | Criterio de PASA | Estado | Evidencia |
|---|---|---|---|---|---|
| T-006 | QA | Protocolo y herramientas de verificación (control positivo de fps y de captura); veredicto de T-001…T-005 | cada veredicto con captura comparada y números | en curso | |

## Ola 4b — pulido nocturno (23:45 → 07:00)
Ciclo hasta que todo esté en PASA: veredicto de QA → FALLA vuelve a su dueño con lo que hay que arreglar → nueva entrega → QA.
Prioridad: 1) la obra 3D entera corre de la espera al acta sin errores; 2) cada transición se lee como fragmentación; 3) rendimiento
(medido por QA con turno de GPU; objetivo: ≥ 50 fps en este Mac en calidad media, alta reservada para la sala); 4) la guía se lee
sobre cualquier universo; 5) belleza contra las referencias.

| Id | Dueño | Qué | Estado |
|---|---|---|---|
| T-012 | 3D-PI | pinya3d: horneado de cuerpos sin bloquear (en trozos por frame o en la carga) · brazos alzados que no parezcan antenas · piernas y manos con algo de forma | PASA (QA 03:22: brazos en dos tramos con codo; muros llenos con luz sólo en la mano; banda fill 1 18–29, closed 54–60; WebGL2 idéntico) |
| T-013 | 3D-BR | brasa3d: esquirlas que caen visibles en arrive · humo en penachos, no velo | PASA — QA 23:43: esquirlas de arrive visibles, humo en penachos; 15 manos: banda de la guía 55–103 (antes 79–124; el constructor medía 36–65), no bloqueante |
| T-004b | 3D-FE | festa3d: las 3 mejoras no bloqueantes de QA (notas/QA.md › T-004) | entregado | ya resuelto en T-010/T-010b; sin cambios de código; capturas t10_* en scratchpad/festa3d |
| T-014 | 3D-FE | festa3d: la ressonància libre más impactante — momento de grupo (muchas manos en sintonía abren la sala) y deleite en solitario, sin instrucciones (pedido de Vicente: «impactante y entretenido sin mucha instrucción») | PASA (QA 03:21: florecimiento pico +5,5 s, subida ≤ ×1,54/s, 0 % a 255, calma 7,5–9 s; parpadeo a resonancia 1 0,9–4,3 %; coronas legibles) |
| T-015 | 3D-PO | `parts/baixada3d.js`: universo «Luz que llueve» de la bajada (GUION › La bajada — Seny): el castell se deshace piso a piso en lluvia lenta de color que cae y se apaga en las manos; convive con plaza + castell; INT lo integra | PASA (QA 04:58: bajada asentada 71 % bajo luma 15; castell, objetivo y texto legibles) |
| T-016 | 3D-PI | pinya3d: que la multitud no se lea como maniquíes — cuerpo oscuro de materia, luz sólo en el borde y donde aprieta la mano; los de delante con los pies en el suelo (sombra de contacto o niebla baja, no flotan); manos y caderas | PASA (QA 00:02: materia oscura, luz en la palma, charco en el suelo, dedos; mano a 0,8 m funciona; WebGL2 idéntico) |
| T-017 | 3D-BR | `parts/fall3d.js`: la caída prediseñada (*intent* tras Pom, *carregat* en la bajada), 15 s con guion de tiempos, en el lenguaje de la fragmentación | PASA en la obra (QA 03:47: carregat desde la bajada se hunde desde la base, banda ≤ 34, «IT FELL» legible; intent desde Pom: la ciudad se agrieta en oro, el castell se reúne y estalla — reunión tenue, estrella de la enxaneta sube la banda a 78 un momento) |
| T-018 | 3D-FE | festa3d: la coronación prediseñada (25 s) contra el GUION — destello de oro por lo alto de los 4 muros, torres coronadas, la sala llena de luz por primera vez — y el florecimiento del máximo de la ressonància luminoso (el momento más luminoso de la obra) sin desorden | PASA (QA 03:21: florecimiento pico +5,5 s, subida ≤ ×1,54/s, 0 % a 255, calma 7,5–9 s; parpadeo a resonancia 1 0,9–4,3 %; coronas legibles) final 03:25: floración ×1,75/s máx, pico luma 120, 0 % a 255, calma ~8 s; parpadeo 1,5–1,8 %; costura, P2 res 0 (0,9 %) y WebGL2 sin errores; notas/3D-FE.md › T-018 final |
| T-019 | 3D-PI | Auditoría de transiciones de res-obra3d (sólo lectura + capturas): cada cruce de bloque a 0 / 1,5 / 3 / 5 s, ¿se lee como fragmentación?; hallazgos por dueño | hecho (auditoría con saltos 23:46 y pase natural 04:00–04:13; notas/3D-PI.md) |
| T-020 | 3D-BR | La espera (primera imagen de la obra, GUION › Espera): brasa3d en su estado de espera — «una línea de brasas respira a la altura de las manos», invitante, casi a oscuras, junto a los botones de la guía | PASA (QA 00:20: espera 92 % oscura en la obra; línea de brasas que respira) | 00:08 · brasa3d sola con la guía: 96,7–97,2 % del muro bajo luma 15, línea continua en P3|P4, respira (pico 136–155 / 45), mano al instante, WebGL2 igual; en la obra la oscuridad la rompe atmos (lámparas de muestra + bruma): para INT · notas/3D-BR.md › T-020 |
| T-021 | 3D-PO | `parts/tronc3d.js` (Tronc — piedra y cerámica: mosaico de trencadís en las faixes de los cuerpos reales del castell) | PASA (QA 03:24: fajas piso a piso, weak tira las piezas de arriba, en la obra se leen como fajas de trencadís; WebGL2 igual; costura 0). Nota: las fajas bajas salen casi blancas y planas | PASA | QA 03:31: pisos, lean/weak, reward, arrive/leave, costura y WebGL2 bien; cinturones bajos casi blancos (nota) → notas/QA.md › T-021 |
| T-022 | INT · 3D-BR · 3D-FE · 3D-PO · 3D-PI | Arreglos de transiciones de la auditoría T-019 (`tickets/T-022-transiciones.md`) | PASA (QA: llegadas pom/acta/brasa, intro→brasa, pom→crown, festa→baixada; humo final 04:50 y repeticiones a ritmo 1 04:58) | 3D-FE: su parte entregada (notas/3D-FE.md › 03:26); la red de triángulos de pom→crown es la salida de pom3d |
| T-023 | 3D-PI | Álbum para Vicente: una captura «héroe» por bloque (espera → acta, y la caída) desde res-obra3d con público virtual, tira en dos filas a 1600 px; guion reutilizable; primera tanda ya (sirve de segunda auditoría visual), tanda final 06:00 | hecho (álbum final 04:43, rehecho pinya 04:50: lab/estudio/album/) |
| T-024 | 3D-BR | brasa3d contra el GUION › I. Brasa: «cada toque levanta un chorro de chispas que suben y caen; al arrastrar, un rastro» — camino solo y en grupo, con sensación LiDAR (L), a velocidades humanas | PASA (QA 03:34: chorro de chispas al tocar, diablos con LiDAR, rastro de brasas al arrastrar 4,5–9,8 % de píxeles > 60, techo de 15 manos ≤ 55) | QA 03:34 (re-check): rastro visible a la altura de la mano, 4,5–6,5 % > 60 (LiDAR 3,5–9,8 %), sin mano 0 % → notas/QA.md › T-024 |
| T-025 | INT | Página de revisión para Vicente (res-obra3d/review.html, sólo laboratorio): tarjeta de inicio con elección de capítulo, idioma de voz EN/ES, personas y calidad; el salto de capítulo sincroniza sonido e imagen (hoy el sonido tarda 3–4 s) | hecho (selector en review.html; saltos sincronizados con el sonido) |
| T-008 | 3D-PO | pom3d: pasos 4 (fibras) y 2 (cuerpos); paso 1 descartado (DECISIONES 23:20) | PASA (QA 23:45: pasos 2–4 y salida v2; WebGL2 idéntico; banda 13–37) |

## Ola 5 — entrega a Vicente · 08:00 (24-11)
`lab/estudio/PARA-VICENTE.md`: enlaces que abrir (obra 3D entera con público virtual y sonido, cada capítulo por separado), qué mirar
(lista corta), capturas, qué falta y qué sólo se puede ver en la sala. Todo congelado desde las 07:30: nadie toca archivos.
Sin commits hasta que Vicente decida la autoría.
