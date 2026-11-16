# VEATION Touch — contrato del proyecto (leer siempre)

Software de tracking táctil con LiDAR 2D para muros interactivos de salas inmersivas, de Alma Digital
Studio (director creativo: Beltrán; developer: Claude). Recibe N sensores **Slamtec RPLIDAR S2E** por
Ethernet/UDP, calibra la sala, define zonas y envía toques por **OSC, TUIO, WebSocket y Spout** (y zonas por
Webhook, Art-Net y sACN) a TouchDesigner, Unreal y apps propias. Se opera desde el escritorio **y desde un teléfono/tablet dentro de la sala**.
Producto reutilizable: **nada de una sala concreta va en el código** — todo vive en perfiles de sala
(`profiles/*.json`). Barcelona XR Lab (`profiles/xrlab.json`) es sólo el primer prototipo.

## Mapa
- **`ARCHITECTURE.md`** = cómo funciona (procesos, coordenadas, pipeline, protocolo S2E, robustez). Leer antes de tocar el motor.
- **`docs/OSC.md`** = contrato de salida (OSC, Triggers, TUIO, WebSocket, Webhook, Art-Net, sACN, Spout, SDK) — es API pública: cambiarla rompe proyectos de clientes.
- **`docs/research/`** = investigación previa (informes + notas, incluida la documentación oficial del S2E con los PDFs de Slamtec).
- **`README.md`** = índice del repositorio y cómo arrancar.

## Convenciones (obligatorias)
- **Idioma:** chat en castellano neutro (sin voseo). **El software es SÓLO en inglés** (misma regla que VEATION).
- **Diseño:** tokens y estética de VEATION (`Immersive Studio Pro/index.html` + `docs/MARCA.md` de ese repo): 3 superficies
  neutras `#111/#1B1B1B/#262626`, tinta `#E0E0E0/#B8B8B8`, presupuesto de **dos acentos** — cian `#4FC3E8` = vivo
  (toques), ámbar `#E5B567` = atención (zonas, objetivos de calibración). El ámbar de lámpara `#F4B23A` sólo en el logo.
  Geist autoalojada (funciona offline). Añadir un tercer acento exige cambiar este párrafo.
- **Licencias:** el software es propiedad de Alma Digital Studio. Sólo dependencias MIT/BSD/Apache/ISC; nada GPL/LGPL.
  Dependencias de runtime hoy: `ws` (MIT) y `qrcode-generator` (MIT). El driver del S2E es implementación propia
  desde el protocolo publicado (no se copia el SDK de Slamtec).
- **Cada cambio de comportamiento lleva su prueba** en `tests/`. Pregunta obligatoria: ¿la prueba sabe fallar?
  (ej.: sin la corrección de contacto el error sube a ~35 mm y la prueba de precisión cae).
- **Nada de `prompt/alert/confirm`** en la UI (Electron no los soporta): usar `promptBox/confirmBox` de `ui/js/dom.js`.
- **Orden en disco:** todo dentro de esta carpeta; lo temporal en el scratchpad de la sesión.

## Comandos
- `npm test` — pruebas (núcleo + driver UDP contra el emulador del S2E). `npm run check` — sintaxis de todo.
- `npm run engine` — motor sin Electron en `http://localhost:8770` (datos en `./.data`). Útil para la UI y en headless.
- `npm start` — app de escritorio (Electron). Datos en `%APPDATA%\VEATION Touch`.
- `npm run dist` — instalador NSIS en `dist/`.
- Sin hardware: perfil **"Barcelona XR Lab (simulated)"** (sensores simulados + manos virtuales en la vista Live).

## Pendiente de validar con hardware (ver ARCHITECTURE.md › Validación)
Distancia plano–pared, ruido real del S2E, interferencia entre muros, comportamiento al desconectar, modo de
escaneo por defecto, cambio de IP por comando (`setStaticIp` sin probar), latencia extremo a extremo.
