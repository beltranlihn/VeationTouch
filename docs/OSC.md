# Output protocol (public API)

All coordinates are **u, v ∈ 0–1 with the origin at the TOP-LEFT** of the wall (default) or of the whole output
canvas (destination option *Canvas*). Velocities are in u/s, v/s. Sizes in metres, ages in seconds.
Ids are unique per touch for the whole session (they never repeat while the engine runs).

## OSC (UDP, default port 9000, prefix `/vt`)

Sent at the destination rate (default 60 Hz), packed in bundles below 1400 bytes (no IP fragmentation).
`down` / `up` and zone events are sent immediately, even between frames.

| Address | Arguments |
|---|---|
| `/vt/frame` | `i seq` `f time_s` |
| `/vt/room/count` | `i` touches in the room |
| `/vt/room/burst` | `i` touch-downs in the last 300 ms ("hands landing together") |
| `/vt/wall/<wallId>/count` | `i` |
| `/vt/wall/<wallId>/alive` | `i…` ids currently on the wall |
| `/vt/wall/<wallId>/touch` | `i id` `f u` `f v` `f vu` `f vv` `f size` `f age` |
| `/vt/wall/<wallId>/down` | `i id` `f u` `f v` |
| `/vt/wall/<wallId>/up` | `i id` `f u` `f v` `f duration` |
| `/vt/zone/<zoneId>/enter` · `/hold` · `/exit` | `i count` |
| `/vt/zone/<zoneId>/count` | `i` |
| `/vt/test` | `s` `i` — sent by *Send test* |

**TouchDesigner:** OSC In DAT on the port (it splits bundles into rows); filter with a Select DAT on
`/vt/wall/*/touch`, or use an OSC In CHOP for counts. **Unreal:** OSC plugin → OSC Server, bind
`/vt/wall/*/touch` and the `down`/`up` addresses.

## TUIO 1.1 (UDP, default port 3333)

Standard `/tuio/2Dcur` (`source`, `alive`, `set s x y X Y m`, `fseq`), one source per wall (`vt-<wallId>@veation`).
With *One port per wall* each wall gets its own port (base port + index) for receivers that ignore `source`.

## WebSocket (`ws://<server>:<port>/ws/data`)

On connect: `{type:"hello", profile:{id, name, canvas, walls:[{id,name,width,height,pixelRect}]}}`.
Then frames:

```json
{"type":"frame","seq":123,"t":45678,
 "walls":[{"id":"P2","touches":[{"id":7,"u":0.41,"v":0.62,"x":3.01,"y":1.33,"vx":0.1,"vy":0,"size":0.08,"age":1.2}]}],
 "events":[{"type":"down","id":7,"wallId":"P2","x":3.01,"y":1.33,"t":45600}],
 "zones":{"Z1":{"count":1,"active":true,"ids":[7]}},"zoneEvents":[],"room":{"count":1,"burst":0}}
```

Send `{"type":"subscribe","rateHz":30}` to lower the rate. `x, y` are wall metres (origin bottom-left).
SDK: `http://<server>:<port>/sdk/veation-touch.js` (see the header of the file).
